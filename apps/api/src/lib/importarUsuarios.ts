import ExcelJS from 'exceljs';
import bcrypt from 'bcryptjs';
import { randomBytes, randomInt } from 'crypto';
import type { RolUsuario, FilaImportacionDTO, ResultadoImportacionDTO } from '@erm2026/shared';
import { prisma } from './prisma';
import type { AuthPayload } from './auth';

const MAX_FILAS = 5000;

const normal = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .trim();

// Valor de celda como texto, cubriendo fórmulas, texto enriquecido y correos que
// Excel convierte en hipervínculo.
function texto(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    if ('result' in v) return texto(v.result as ExcelJS.CellValue);
    if ('richText' in v) return v.richText.map((t) => t.text).join('').trim();
    if ('text' in v) return String(v.text).trim();
    if (v instanceof Date) return v.toISOString();
  }
  return String(v).trim();
}

function rolDesdeTexto(s: string): RolUsuario | null {
  const t = normal(s);
  if (t.startsWith('ADMIN')) return 'ADMIN';
  if (t.startsWith('COORD')) return 'COORDINADOR';
  if (t.startsWith('PERSON')) return 'PERSONERO';
  return null;
}

interface FilaInterna extends FilaImportacionDTO {
  existenteId: string | null;
  coordinadorDni: string | null;
}

// Lee y valida el Excel sin escribir nada en la base de datos.
export async function analizarArchivo(archivo: Buffer, importador: AuthPayload): Promise<FilaInterna[]> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(archivo.buffer.slice(archivo.byteOffset, archivo.byteOffset + archivo.byteLength) as ArrayBuffer);
  } catch {
    throw new Error('No se pudo leer el archivo. Debe ser un Excel (.xlsx).');
  }
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('El archivo no tiene hojas.');

  // Las columnas se ubican por su título, así no importa el orden ni columnas vacías.
  const col: Partial<Record<'dni' | 'nombre' | 'rol' | 'depende' | 'correo' | 'telefono' | 'mesas', number>> = {};
  ws.getRow(1).eachCell((celda, n) => {
    const h = normal(texto(celda.value));
    if (!h) return;
    if (h.startsWith('DNI') && col.dni === undefined) col.dni = n;
    else if (h.includes('NOMBRE') && col.nombre === undefined) col.nombre = n;
    else if (h.startsWith('ROL') && col.rol === undefined) col.rol = n;
    else if (h.includes('DEPENDE') && col.depende === undefined) col.depende = n;
    else if ((h.includes('CORREO') || h.includes('EMAIL')) && col.correo === undefined) col.correo = n;
    else if ((h.includes('TELEF') || h.includes('CELULAR')) && col.telefono === undefined) col.telefono = n;
    else if (h.includes('MESA') && col.mesas === undefined) col.mesas = n;
  });
  if (!col.dni || !col.nombre || !col.rol) {
    throw new Error('No se encontraron las columnas DNI, NOMBRES Y APELLIDOS y ROL en la primera fila. Usa la plantilla.');
  }

  const filas: FilaInterna[] = [];
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const celda = (c?: number) => (c ? texto(row.getCell(c).value) : '');
    const dniCelda = col.dni ? row.getCell(col.dni).value : null;
    const valores = [celda(col.dni), celda(col.nombre), celda(col.rol), celda(col.depende), celda(col.correo), celda(col.telefono), celda(col.mesas)];
    if (valores.every((v) => !v)) return;

    // Excel guarda los DNI como número y se come los ceros iniciales.
    let dni = valores[0].replace(/\D/g, '');
    if (typeof dniCelda === 'number' && dni.length > 0 && dni.length < 8) dni = dni.padStart(8, '0');

    filas.push({
      fila: n,
      dni,
      nombre: valores[1].replace(/\s+/g, ' '),
      rol: rolDesdeTexto(valores[2]),
      dependeDe: valores[3],
      correo: valores[4].toLowerCase(),
      telefono: valores[5],
      mesas: valores[6]
        ? valores[6]
            .split(/[,;\s]+/)
            .map((m) => m.replace(/\D/g, ''))
            .filter(Boolean)
            .map((m) => m.padStart(6, '0'))
        : [],
      accion: 'crear',
      errores: [],
      avisos: [],
      existenteId: null,
      coordinadorDni: null,
    });
  });
  if (filas.length === 0) throw new Error('El archivo no tiene filas con datos.');
  if (filas.length > MAX_FILAS) throw new Error(`El archivo tiene ${filas.length} filas; el máximo por carga es ${MAX_FILAS}.`);

  const esCoordinador = importador.rol === 'COORDINADOR';
  const dnisArchivo = filas.map((f) => f.dni).filter(Boolean);
  const correosArchivo = filas.map((f) => f.correo).filter(Boolean);
  const codigosMesa = [...new Set(filas.flatMap((f) => f.mesas))];

  const [existentes, coordinadores, conCorreo, mesas] = await Promise.all([
    prisma.usuario.findMany({ where: { dni: { in: dnisArchivo } } }),
    prisma.usuario.findMany({ where: { rol: 'COORDINADOR' }, select: { dni: true, nombre: true } }),
    prisma.usuario.findMany({ where: { email: { in: correosArchivo } }, select: { dni: true, email: true } }),
    prisma.mesa.findMany({ where: { codigo: { in: codigosMesa } }, include: { personero: { select: { dni: true, nombre: true } } } }),
  ]);
  const existentePorDni = new Map(existentes.map((u) => [u.dni, u]));
  const mesaPorCodigo = new Map(mesas.map((m) => [m.codigo, m]));
  const correoDe = new Map(conCorreo.map((u) => [u.email!, u.dni]));

  const vistosDni = new Map<string, number>();
  const vistosCorreo = new Map<string, number>();
  const mesaTomadaPor = new Map<string, number>();

  for (const f of filas) {
    if (!/^\d{8}$/.test(f.dni)) f.errores.push('DNI inválido (deben ser 8 dígitos)');
    else if (vistosDni.has(f.dni)) f.errores.push(`DNI repetido (ya aparece en la fila ${vistosDni.get(f.dni)})`);
    else vistosDni.set(f.dni, f.fila);

    if (!f.nombre) f.errores.push('Falta el nombre');
    if (!f.rol) f.errores.push('Rol no reconocido (usa Administrador, Coordinador o Personero)');
    if (esCoordinador && f.rol && f.rol !== 'PERSONERO') f.errores.push('Como coordinador solo puedes cargar personeros');

    if (f.correo) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.correo)) f.errores.push('Correo inválido');
      else if (vistosCorreo.has(f.correo)) f.errores.push(`Correo repetido (fila ${vistosCorreo.get(f.correo)})`);
      else if (correoDe.has(f.correo) && correoDe.get(f.correo) !== f.dni) f.errores.push('Ese correo ya lo usa otro usuario');
      vistosCorreo.set(f.correo, f.fila);
    }

    const existente = existentePorDni.get(f.dni);
    if (existente) {
      f.accion = 'actualizar';
      f.existenteId = existente.id;
      if (f.rol && existente.rol !== f.rol) f.errores.push(`Ese DNI ya existe con rol ${existente.rol}; el rol no se cambia por carga masiva`);
      if (esCoordinador && existente.rol === 'PERSONERO' && existente.coordinadorId !== importador.sub) {
        f.errores.push('Ese personero pertenece a otro coordinador');
      } else if (esCoordinador && existente.rol !== 'PERSONERO' && f.rol === 'PERSONERO') {
        f.errores.push('Ese DNI pertenece a un usuario que no puedes modificar');
      }
    }
  }

  // Coordinadores disponibles para "Depende de": existentes + los válidos del archivo.
  const coordsArchivo = filas.filter((f) => f.rol === 'COORDINADOR' && f.errores.length === 0);
  const candidatos = [
    ...coordinadores.map((c) => ({ dni: c.dni, nombre: c.nombre })),
    ...coordsArchivo.map((c) => ({ dni: c.dni, nombre: c.nombre })),
  ];

  for (const f of filas) {
    if (f.rol === 'PERSONERO') {
      if (esCoordinador) {
        if (f.dependeDe) f.avisos.push('Se asigna a ti como coordinador');
      } else if (!f.dependeDe) {
        f.errores.push('Indica en "Depende de" el DNI o nombre de su coordinador');
      } else {
        const ref = f.dependeDe.replace(/\D/g, '');
        const encontrados = /^\d{7,8}$/.test(ref)
          ? candidatos.filter((c) => c.dni === ref.padStart(8, '0'))
          : candidatos.filter((c) => normal(c.nombre) === normal(f.dependeDe));
        const unicos = [...new Map(encontrados.map((c) => [c.dni, c])).values()];
        if (unicos.length === 0) f.errores.push(`No existe un coordinador "${f.dependeDe}"`);
        else if (unicos.length > 1) f.errores.push(`Hay varios coordinadores llamados "${f.dependeDe}"; usa su DNI`);
        else f.coordinadorDni = unicos[0].dni;
      }

      for (const codigo of f.mesas) {
        const mesa = mesaPorCodigo.get(codigo);
        if (!mesa) {
          f.errores.push(`La mesa ${codigo} no existe en el padrón`);
          continue;
        }
        if (mesaTomadaPor.has(codigo)) {
          f.errores.push(`La mesa ${codigo} ya se asigna en la fila ${mesaTomadaPor.get(codigo)}`);
          continue;
        }
        mesaTomadaPor.set(codigo, f.fila);
        if (mesa.personero && mesa.personero.dni !== f.dni) {
          f.avisos.push(`La mesa ${codigo} pasará de ${mesa.personero.nombre} a esta persona`);
        }
      }
    } else if (f.rol) {
      if (f.dependeDe) f.avisos.push('"Depende de" solo aplica a personeros; se ignora');
      if (f.mesas.length) f.avisos.push('Solo los personeros tienen mesas; se ignoran');
      if (f.accion === 'crear') f.avisos.push('Se generará una contraseña temporal');
    }
    if (f.errores.length) f.accion = 'error';
  }
  return filas;
}

function contrasenaTemporal(): string {
  const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  return Array.from({ length: 10 }, () => letras[randomInt(letras.length)]).join('');
}

// Aplica las filas válidas. Las que tienen errores se omiten.
export async function ejecutarImportacion(filas: FilaInterna[], importador: AuthPayload): Promise<ResultadoImportacionDTO> {
  const validas = filas.filter((f) => f.accion !== 'error');
  const nuevosConClave = validas.filter((f) => f.accion === 'crear' && f.rol !== 'PERSONERO');

  // bcrypt es lento: se calcula fuera de la transacción. Los personeros entran solo
  // con DNI, así que comparten un hash de un valor aleatorio que nadie conoce.
  const hashSinClave = await bcrypt.hash(randomBytes(32).toString('hex'), 10);
  const credenciales: ResultadoImportacionDTO['credenciales'] = [];
  const hashPorDni = new Map<string, string>();
  for (const f of nuevosConClave) {
    const password = contrasenaTemporal();
    credenciales.push({ dni: f.dni, nombre: f.nombre, rol: f.rol!, password });
    hashPorDni.set(f.dni, await bcrypt.hash(password, 10));
  }

  let creados = 0;
  let actualizados = 0;
  let mesasAsignadas = 0;

  await prisma.$transaction(
    async (tx) => {
      const idPorDni = new Map<string, string>();
      const coordinadoresExistentes = await tx.usuario.findMany({ where: { rol: 'COORDINADOR' }, select: { id: true, dni: true } });
      coordinadoresExistentes.forEach((c) => idPorDni.set(c.dni, c.id));

      // Primero administradores y coordinadores, para que los personeros puedan depender de ellos.
      const orden = [...validas.filter((f) => f.rol !== 'PERSONERO'), ...validas.filter((f) => f.rol === 'PERSONERO')];
      for (const f of orden) {
        const coordinadorId =
          f.rol === 'PERSONERO' ? (importador.rol === 'COORDINADOR' ? importador.sub : idPorDni.get(f.coordinadorDni!)!) : null;
        const datos = {
          nombre: f.nombre,
          ...(f.correo ? { email: f.correo } : {}),
          ...(f.telefono ? { telefono: f.telefono } : {}),
          ...(f.rol === 'PERSONERO' ? { coordinadorId } : {}),
        };
        let id: string;
        if (f.existenteId) {
          await tx.usuario.update({ where: { id: f.existenteId }, data: datos });
          id = f.existenteId;
          actualizados++;
        } else {
          const nuevo = await tx.usuario.create({
            data: { ...datos, dni: f.dni, rol: f.rol!, passwordHash: hashPorDni.get(f.dni) ?? hashSinClave },
          });
          id = nuevo.id;
          creados++;
        }
        idPorDni.set(f.dni, id);

        if (f.rol === 'PERSONERO' && f.mesas.length) {
          const r = await tx.mesa.updateMany({ where: { codigo: { in: f.mesas } }, data: { personeroId: id } });
          mesasAsignadas += r.count;
        }
      }
    },
    { timeout: 120_000 }
  );

  return { creados, actualizados, omitidos: filas.length - validas.length, mesasAsignadas, credenciales };
}

export function aDTO(filas: FilaInterna[]): FilaImportacionDTO[] {
  return filas.map(({ existenteId: _e, coordinadorDni: _c, ...resto }) => resto);
}

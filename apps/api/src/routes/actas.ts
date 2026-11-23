import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requiereAuth } from '../lib/auth';
import type { ActaResumenDTO, ActaSyncResult, Cargo, LecturaActaDTO } from '@erm2026/shared';
import { emparejarOrganizacion, leerActa, LectorError, motivoLectorNoDisponible } from '../lib/lectorActas';
import type { Server as SocketIOServer } from 'socket.io';

const resultadoSchema = z.object({
  listaCandidaturaId: z.string().nullable(),
  tipo: z.enum(['VOTO_LISTA', 'BLANCO', 'NULO', 'IMPUGNADO']),
  votos: z.number().int().min(0),
});

const syncSchema = z.object({
  clienteId: z.string().min(1),
  mesaId: z.string().min(1),
  cargo: z.enum(['GOBERNADOR_REGIONAL', 'CONSEJERO_REGIONAL', 'ALCALDE_PROVINCIAL', 'ALCALDE_DISTRITAL']),
  resultados: z.array(resultadoSchema).min(1),
  observaciones: z.string().optional(),
  fotoBase64: z.string().optional(),
  digitadaEn: z.string(),
  // Solo ADMIN/COORDINADOR: registrar el acta a nombre de un personero (p.ej. la dictó por teléfono).
  personeroId: z.string().optional(),
  totalEmitidosActa: z.number().int().min(0).optional(),
  leidaPorIA: z.boolean().optional(),
});

const CARGOS = ['GOBERNADOR_REGIONAL', 'CONSEJERO_REGIONAL', 'ALCALDE_PROVINCIAL', 'ALCALDE_DISTRITAL'] as const;

const leerSchema = z.object({
  fotoBase64: z.string().min(100),
  mesaId: z.string().optional(),
  cargo: z.enum(CARGOS).optional(),
});

// Reglas de cuadre del acta: si algo no cuadra, el acta se guarda igual pero
// queda OBSERVADA para que un coordinador/administrador la revise.
export function problemasDeCuadre(sumaVotos: number, totalEmitidosActa: number | undefined, electoresHabiles: number): string[] {
  const problemas: string[] = [];
  if (totalEmitidosActa !== undefined && totalEmitidosActa !== sumaVotos) {
    problemas.push(`La suma de votos (${sumaVotos}) no coincide con el total emitido escrito en el acta (${totalEmitidosActa})`);
  }
  if (electoresHabiles > 0 && sumaVotos > electoresHabiles) {
    problemas.push(`La suma de votos (${sumaVotos}) supera a los electores hábiles (${electoresHabiles})`);
  }
  return problemas;
}

// Busca la mesa por el número leído en la foto, tolerando ceros a la izquierda.
async function buscarMesaPorCodigo(codigo: string) {
  const limpio = codigo.replace(/\D/g, '');
  if (!limpio) return null;
  const candidatos = [...new Set([limpio, limpio.padStart(6, '0'), limpio.replace(/^0+/, '')])].filter(Boolean);
  return prisma.mesa.findFirst({
    where: { codigo: { in: candidatos } },
    include: { localVotacion: { include: { distrito: { include: { provincia: true } } } } },
  });
}

export function buildActasRouter(io: SocketIOServer) {
  const router = Router();
  router.use(requiereAuth);

  // Lector de actas: devuelve lo que la IA leyó en la foto. No guarda nada.
  // Para mostrar u ocultar los botones de "leer con IA" en las apps.
  router.get('/lector-estado', async (_req, res) => {
    const motivo = await motivoLectorNoDisponible();
    res.json({ disponible: !motivo, motivo });
  });

  router.post('/leer', async (req, res) => {
    const motivo = await motivoLectorNoDisponible();
    if (motivo) return res.status(503).json({ error: motivo });
    const parsed = leerSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Foto inválida' });
    const input = parsed.data;

    let lectura;
    try {
      lectura = await leerActa(input.fotoBase64);
    } catch (e) {
      console.error('[lector] error', e);
      const msg = e instanceof LectorError ? e.message : 'No se pudo leer la foto en este momento. Intenta de nuevo o digita a mano.';
      return res.status(502).json({ error: msg });
    }

    const avisos: string[] = [];
    if (!lectura.es_acta) avisos.push('La IA no reconoce esta imagen como un acta legible. Revisa todos los datos.');
    avisos.push(...lectura.dudas);

    // Mesa: la leída en la foto; si el formulario ya tenía una mesa y no coincide, se avisa.
    const mesaLeida = await buscarMesaPorCodigo(lectura.mesa_codigo);
    let mesa = mesaLeida;
    if (input.mesaId) {
      const abierta = await prisma.mesa.findUnique({
        where: { id: input.mesaId },
        include: { localVotacion: { include: { distrito: { include: { provincia: true } } } } },
      });
      if (abierta && mesaLeida && abierta.id !== mesaLeida.id) {
        avisos.push(`La foto parece ser de la mesa ${mesaLeida.codigo}, no de la mesa ${abierta.codigo}. Verifica que sea el acta correcta.`);
      }
      mesa = abierta ?? mesaLeida;
    }
    if (!mesa) {
      avisos.push(
        lectura.mesa_codigo
          ? `La mesa ${lectura.mesa_codigo} leída en la foto no existe en el padrón.`
          : 'No se pudo leer el número de mesa en la foto.',
      );
    } else if (req.usuario!.rol === 'PERSONERO' && mesa.personeroId !== req.usuario!.sub) {
      avisos.push(`La mesa ${mesa.codigo} no está asignada a ti. Puedes enviar el acta igual; quedará registrado que la envió un personero no asignado.`);
    }

    // Cargo: el indicado, o el primero que tenga listas (en segunda vuelta solo hay Gobernador).
    let cargo: Cargo | null = input.cargo ?? null;
    if (!cargo) {
      const conListas = await prisma.listaCandidatura.findMany({ select: { cargo: true }, distinct: ['cargo'] });
      const set = new Set(conListas.map((c) => c.cargo));
      cargo = CARGOS.find((c) => set.has(c)) ?? null;
    }

    const votosPorLista: Record<string, number | null> = {};
    if (mesa && cargo) {
      const d = mesa.localVotacion.distrito;
      const where: any = { cargo, provinciaNombre: '', distritoNombre: '' };
      if (cargo === 'CONSEJERO_REGIONAL' || cargo === 'ALCALDE_PROVINCIAL') where.provinciaNombre = d.provincia.nombre;
      if (cargo === 'ALCALDE_DISTRITAL') {
        where.provinciaNombre = d.provincia.nombre;
        where.distritoNombre = d.nombre;
      }
      const listas = (await prisma.listaCandidatura.findMany({ where, include: { organizacion: true } })).map((l) => ({
        id: l.id,
        organizacion: l.organizacion.nombre,
      }));
      for (const fila of lectura.organizaciones) {
        const lista = emparejarOrganizacion(fila.nombre, listas);
        if (lista) votosPorLista[lista.id] = fila.votos;
        else avisos.push(`La organización "${fila.nombre}" leída en la foto no está en la cédula de esta mesa.`);
      }
      for (const l of listas) {
        if (!(l.id in votosPorLista)) avisos.push(`No se leyeron votos para ${l.organizacion}.`);
      }

      const suma =
        Object.values(votosPorLista).reduce<number>((a, b) => a + (b ?? 0), 0) +
        (lectura.votos_blanco ?? 0) +
        (lectura.votos_nulos ?? 0) +
        (lectura.votos_impugnados ?? 0);
      avisos.push(...problemasDeCuadre(suma, lectura.total_emitidos ?? undefined, mesa.electores));
      if (lectura.electores_habiles != null && mesa.electores > 0 && lectura.electores_habiles !== mesa.electores) {
        avisos.push(`El acta dice ${lectura.electores_habiles} electores hábiles y el padrón ${mesa.electores}.`);
      }
    }

    // ¿Esa acta (mesa + cargo) ya fue enviada? Se avisa para no registrarla dos veces.
    let yaEnviada: LecturaActaDTO['yaEnviada'] = null;
    if (mesa && cargo) {
      const existente = await prisma.acta.findUnique({
        where: { mesaId_cargo: { mesaId: mesa.id, cargo } },
        include: { personero: true },
      });
      if (existente) {
        yaEnviada = { actaId: existente.id, estado: existente.estado, personeroNombre: existente.personero.nombre, digitadaEn: existente.digitadaEn.toISOString() };
        avisos.unshift(`Esta acta ya fue enviada por ${existente.personero.nombre}. No se registrará otra vez.`);
      }
    }

    const dto: LecturaActaDTO = {
      mesaCodigoLeido: lectura.mesa_codigo,
      mesaId: mesa?.id ?? null,
      mesaCodigo: mesa?.codigo ?? null,
      cargo,
      votosPorLista,
      blanco: lectura.votos_blanco,
      nulo: lectura.votos_nulos,
      impugnado: lectura.votos_impugnados,
      totalEmitidos: lectura.total_emitidos,
      electoresHabilesLeido: lectura.electores_habiles,
      avisos,
      yaEnviada,
    };
    res.json(dto);
  });

  router.post('/sync', async (req, res) => {
    const parsed = syncSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Datos de acta inválidos', detalle: parsed.error.flatten() });
    }
    const input = parsed.data;
    let personeroId = req.usuario!.sub;
    if (input.personeroId && input.personeroId !== personeroId) {
      const rol = req.usuario!.rol;
      if (rol !== 'ADMIN' && rol !== 'COORDINADOR') {
        return res.status(403).json({ error: 'Solo un administrador o coordinador puede registrar actas a nombre de otro' });
      }
      const titular = await prisma.usuario.findUnique({ where: { id: input.personeroId } });
      if (!titular || titular.rol !== 'PERSONERO') return res.status(400).json({ error: 'El personero indicado no existe' });
      if (rol === 'COORDINADOR' && titular.coordinadorId !== req.usuario!.sub) {
        return res.status(403).json({ error: 'Ese personero no pertenece a tu equipo' });
      }
      personeroId = titular.id;
    }

    const existente = await prisma.acta.findUnique({ where: { clienteId: input.clienteId } });
    if (existente) {
      const result: ActaSyncResult = { clienteId: input.clienteId, actaId: existente.id, estado: existente.estado };
      return res.json(result);
    }

    const mesa = await prisma.mesa.findUnique({ where: { id: input.mesaId } });
    if (!mesa) return res.status(404).json({ error: 'Mesa no encontrada' });
    // Un personero puede enviar el acta de una mesa que no tiene asignada (p.ej. cubre a
    // un compañero): se acepta, pero queda anotado para que el coordinador lo revise.
    const noAsignada = req.usuario!.rol === 'PERSONERO' && mesa.personeroId !== req.usuario!.sub;

    const yaRegistrada = await prisma.acta.findUnique({
      where: { mesaId_cargo: { mesaId: input.mesaId, cargo: input.cargo } },
      include: { personero: true },
    });
    if (yaRegistrada) {
      const fecha = yaRegistrada.digitadaEn.toLocaleString('es-PE', { timeZone: 'America/Lima', dateStyle: 'short', timeStyle: 'short' });
      return res.status(409).json({
        error: `Esta acta ya fue enviada (mesa ${mesa.codigo}) por ${yaRegistrada.personero.nombre} el ${fecha}; no se registró otra vez.`,
        actaId: yaRegistrada.id,
        estado: yaRegistrada.estado,
        personeroNombre: yaRegistrada.personero.nombre,
        mismoPersonero: yaRegistrada.personeroId === personeroId,
      });
    }

    const sumaVotos = input.resultados.reduce((a, r) => a + r.votos, 0);
    const problemas = problemasDeCuadre(sumaVotos, input.totalEmitidosActa, mesa.electores);
    const notas = [
      input.leidaPorIA ? '[Leída con IA y revisada]' : null,
      noAsignada ? '[Enviada por un personero no asignado a esta mesa]' : null,
      ...problemas.map((p) => `[Observada automáticamente] ${p}.`),
      input.observaciones?.trim() || null,
    ].filter(Boolean);

    const acta = await prisma.acta.create({
      data: {
        clienteId: input.clienteId,
        mesaId: input.mesaId,
        cargo: input.cargo,
        personeroId,
        estado: problemas.length > 0 ? 'OBSERVADA' : 'ENVIADA',
        observaciones: notas.length > 0 ? notas.join('\n') : null,
        fotoBase64: input.fotoBase64,
        digitadaEn: new Date(input.digitadaEn),
        resultados: {
          create: input.resultados.map((r) => ({
            tipo: r.tipo,
            votos: r.votos,
            listaCandidaturaId: r.listaCandidaturaId,
          })),
        },
      },
    });

    io.emit('acta:sincronizada', { mesaId: mesa.id, cargo: input.cargo, actaId: acta.id });

    const result: ActaSyncResult = { clienteId: input.clienteId, actaId: acta.id, estado: acta.estado };
    res.status(201).json(result);
  });

  // Listado de actas ya enviadas por los personeros, para revisión en el panel admin.
  router.get('/', async (req, res) => {
    if (!['ADMIN', 'COORDINADOR'].includes(req.usuario!.rol)) {
      return res.status(403).json({ error: 'No tienes permiso para ver las actas' });
    }
    const search = String(req.query.search ?? '').trim();
    const cargo = req.query.cargo ? (String(req.query.cargo) as Cargo) : undefined;
    const estado = req.query.estado ? String(req.query.estado) : undefined;
    const limit = Math.min(parseInt(String(req.query.limit ?? '50'), 10) || 50, 200);
    const offset = parseInt(String(req.query.offset ?? '0'), 10) || 0;

    const where: any = {};
    if (req.usuario!.rol === 'COORDINADOR') where.personero = { coordinadorId: req.usuario!.sub };
    if (cargo) where.cargo = cargo;
    if (estado) where.estado = estado;
    if (search) where.mesa = { codigo: { contains: search } };

    const [total, actas] = await Promise.all([
      prisma.acta.count({ where }),
      prisma.acta.findMany({
        where,
        include: { mesa: { include: { localVotacion: { include: { distrito: { include: { provincia: true } } } } } }, personero: true },
        orderBy: { sincronizadaEn: 'desc' },
        take: limit,
        skip: offset,
      }),
    ]);

    const items: ActaResumenDTO[] = actas.map((a) => ({
      id: a.id,
      mesaId: a.mesaId,
      mesaCodigo: a.mesa.codigo,
      cargo: a.cargo,
      localVotacion: a.mesa.localVotacion.nombre,
      distrito: a.mesa.localVotacion.distrito.nombre,
      provincia: a.mesa.localVotacion.distrito.provincia.nombre,
      personeroNombre: a.personero.nombre,
      estado: a.estado,
      digitadaEn: a.digitadaEn.toISOString(),
      electoresHabiles: a.mesa.electores,
      tieneFoto: !!a.fotoBase64,
    }));

    res.json({ total, items });
  });

  router.post('/:actaId/validar', async (req, res) => {
    if (!['ADMIN', 'COORDINADOR'].includes(req.usuario!.rol)) {
      return res.status(403).json({ error: 'No tienes permiso para validar actas' });
    }
    const acta = await prisma.acta.update({
      where: { id: req.params.actaId },
      data: { estado: 'VALIDADA' },
    });
    io.emit('acta:sincronizada', { mesaId: acta.mesaId, cargo: acta.cargo, actaId: acta.id });
    res.json({ id: acta.id, estado: acta.estado });
  });

  return router;
}

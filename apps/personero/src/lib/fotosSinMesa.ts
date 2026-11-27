import type { ResultadoInput } from '@erm2026/shared';
import { ApiError, SesionExpiradaError } from './api';
import { db, type FotoSinMesa } from './db';
import { leerFoto, SinConexionError } from './lector';
import { sincronizarPendientes } from './sync';

// Fotos de actas escaneadas sin señal desde "Leer acta con foto". Quedan en
// IndexedDB del teléfono; al volver la conexión la IA lee cada una, se arma el
// acta con esos números y se envía sola. Si la suma no cuadra, el servidor la
// deja OBSERVADA para que un coordinador la revise.

export const EVENTO_FOTOS_SIN_MESA = 'erm2026-fotos-sin-mesa';

function avisarCambio() {
  window.dispatchEvent(new Event(EVENTO_FOTOS_SIN_MESA));
}

export async function guardarFotoSinMesa(fotoDataUrl: string): Promise<number> {
  await db.fotosSinMesa.add({
    id: crypto.randomUUID(),
    fotoDataUrl,
    tomadaEn: new Date().toISOString(),
    estado: 'esperando',
  });
  avisarCambio();
  return db.fotosSinMesa.where('estado').equals('esperando').count();
}

let procesando = false;

export async function procesarFotosSinMesa(): Promise<void> {
  if (procesando || !navigator.onLine) return;
  procesando = true;
  try {
    const cola = await db.fotosSinMesa.where('estado').equals('esperando').sortBy('tomadaEn');
    for (const f of cola) {
      try {
        await procesarUna(f);
      } catch (e) {
        // Sin señal o sesión vencida: la foto sigue esperando y se reintenta luego.
        if (e instanceof SinConexionError || e instanceof SesionExpiradaError) break;
        await db.fotosSinMesa.update(f.id, {
          estado: 'error',
          mensaje: e instanceof ApiError ? e.message : 'No se pudo procesar la foto.',
          procesadaEn: new Date().toISOString(),
        });
      }
      avisarCambio();
    }
  } finally {
    procesando = false;
  }
}

async function procesarUna(f: FotoSinMesa) {
  if (!f.fotoDataUrl) return;
  const lectura = await leerFoto(f.fotoDataUrl);
  const ahora = new Date().toISOString();

  if (!lectura.mesaId || !lectura.cargo || !lectura.mesaCodigo) {
    await db.fotosSinMesa.update(f.id, {
      estado: 'no_reconocida',
      mensaje: `No se reconoció la mesa${lectura.mesaCodigoLeido ? ` ${lectura.mesaCodigoLeido}` : ''}. Regístrala a mano.`,
      procesadaEn: ahora,
    });
    return;
  }
  if (lectura.yaEnviada) {
    await db.fotosSinMesa.update(f.id, {
      estado: 'duplicada',
      mesaCodigo: lectura.mesaCodigo,
      cargo: lectura.cargo,
      mensaje: `Ya había sido enviada por ${lectura.yaEnviada.personeroNombre}.`,
      fotoDataUrl: undefined,
      procesadaEn: ahora,
    });
    return;
  }

  const resultados: ResultadoInput[] = [
    ...Object.entries(lectura.votosPorLista).map(([listaCandidaturaId, votos]) => ({
      listaCandidaturaId,
      tipo: 'VOTO_LISTA' as const,
      votos: votos ?? 0,
    })),
    { listaCandidaturaId: null, tipo: 'BLANCO' as const, votos: lectura.blanco ?? 0 },
    { listaCandidaturaId: null, tipo: 'NULO' as const, votos: lectura.nulo ?? 0 },
    { listaCandidaturaId: null, tipo: 'IMPUGNADO' as const, votos: lectura.impugnado ?? 0 },
  ];
  const observaciones = [
    'Registrada automáticamente con IA (foto tomada sin señal).',
    ...lectura.avisos.map((a) => `[IA] ${a}`),
  ].join('\n');

  const clienteId = crypto.randomUUID();
  await db.actas.add({
    clienteId,
    mesaId: lectura.mesaId,
    mesaCodigo: lectura.mesaCodigo,
    cargo: lectura.cargo,
    resultados,
    observaciones,
    fotoDataUrl: f.fotoDataUrl,
    digitadaEn: f.tomadaEn,
    totalEmitidosActa: lectura.totalEmitidos ?? undefined,
    leidaPorIA: true,
    estado: 'pendiente',
  });
  await sincronizarPendientes();
  const acta = await db.actas.get(clienteId);

  if (acta?.estado === 'sincronizada') {
    await db.fotosSinMesa.update(f.id, {
      estado: 'enviada',
      mesaCodigo: lectura.mesaCodigo,
      cargo: lectura.cargo,
      observada: lectura.avisos.length > 0,
      fotoDataUrl: undefined,
      procesadaEn: ahora,
    });
  } else if (acta?.estado === 'duplicada' || acta?.estado === 'duplicada_vista') {
    await db.actas.update(clienteId, { estado: 'duplicada_vista' });
    await db.fotosSinMesa.update(f.id, {
      estado: 'duplicada',
      mesaCodigo: lectura.mesaCodigo,
      cargo: lectura.cargo,
      mensaje: acta.ultimoError ?? 'Ya había sido enviada por otra persona.',
      fotoDataUrl: undefined,
      procesadaEn: ahora,
    });
  } else if (acta?.estado === 'error') {
    await db.fotosSinMesa.update(f.id, {
      estado: 'error',
      mesaCodigo: lectura.mesaCodigo,
      cargo: lectura.cargo,
      mensaje: `Se leyó, pero el servidor no la aceptó: ${acta.ultimoError ?? 'error'}. Se reintentará sola.`,
      fotoDataUrl: undefined,
      procesadaEn: ahora,
    });
  } else {
    // Quedó pendiente (se cortó la señal o la sesión): el acta ya está en la
    // cola normal de envío, que la reintenta sola. La foto no se vuelve a leer.
    await db.fotosSinMesa.update(f.id, {
      estado: 'enviada',
      mesaCodigo: lectura.mesaCodigo,
      cargo: lectura.cargo,
      observada: lectura.avisos.length > 0,
      mensaje: 'Leída con IA; se terminará de enviar al volver la señal.',
      fotoDataUrl: undefined,
      procesadaEn: ahora,
    });
  }
}

export async function marcarAvisosVistos() {
  const vistas = await db.fotosSinMesa.filter((f) => f.estado !== 'esperando' && !f.avisoVisto).toArray();
  await Promise.all(vistas.map((f) => db.fotosSinMesa.update(f.id, { avisoVisto: true })));
  avisarCambio();
}

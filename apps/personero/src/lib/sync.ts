import type { ActaSyncResult } from '@erm2026/shared';
import { apiFetch, ApiError, SesionExpiradaError } from './api';
import { db } from './db';
import { leerFotosEnCola } from './lector';

let sincronizando = false;

const ULTIMA_SYNC_KEY = 'erm2026_personero_ultima_sync';

export function marcarUltimaSync() {
  localStorage.setItem(ULTIMA_SYNC_KEY, new Date().toISOString());
}

export function getUltimaSync(): Date | null {
  const raw = localStorage.getItem(ULTIMA_SYNC_KEY);
  return raw ? new Date(raw) : null;
}

export async function sincronizarPendientes(): Promise<{ enviadas: number; fallidas: number }> {
  if (sincronizando || !navigator.onLine) return { enviadas: 0, fallidas: 0 };
  sincronizando = true;
  let enviadas = 0;
  let fallidas = 0;
  try {
    const pendientes = await db.actas.where('estado').anyOf('pendiente', 'error').toArray();
    for (const acta of pendientes) {
      try {
        const result = await apiFetch<ActaSyncResult>('/api/actas/sync', {
          method: 'POST',
          body: JSON.stringify({
            clienteId: acta.clienteId,
            mesaId: acta.mesaId,
            cargo: acta.cargo,
            resultados: acta.resultados,
            observaciones: acta.observaciones,
            fotoBase64: acta.fotoDataUrl,
            digitadaEn: acta.digitadaEn,
            totalEmitidosActa: acta.totalEmitidosActa,
            leidaPorIA: acta.leidaPorIA,
          }),
        });
        await db.actas.update(acta.clienteId, { estado: 'sincronizada', actaId: result.actaId, ultimoError: undefined });
        enviadas++;
      } catch (e) {
        // Sesión vencida: el acta sigue pendiente en este dispositivo (no se marca
        // como error ni se borra) y se enviará cuando la persona vuelva a ingresar.
        if (e instanceof SesionExpiradaError) break;
        // Un 409 significa que ese cargo de esa mesa YA tiene acta registrada
        // (p.ej. quedó una copia local duplicada por un doble toque en "Guardar").
        // El servidor ya tiene el dato: lo tratamos como sincronizado, no como error,
        // para no dejar el banner de "pendientes" atascado para siempre.
        // Si la envió OTRA persona, se marca como "duplicada" para avisarle al personero
        // que esa acta ya fue enviada (no se borra del teléfono).
        if (e instanceof ApiError && e.status === 409) {
          const body = e.body as { actaId?: string; estado?: string; mismoPersonero?: boolean } | undefined;
          const deOtro = body?.mismoPersonero === false;
          await db.actas.update(acta.clienteId, {
            estado: deOtro ? 'duplicada' : 'sincronizada',
            actaId: body?.actaId,
            ultimoError: deOtro ? e.message : undefined,
          });
          if (!deOtro) enviadas++;
          continue;
        }
        const mensaje = e instanceof ApiError ? e.message : 'Error de red';
        await db.actas.update(acta.clienteId, { estado: 'error', ultimoError: mensaje });
        fallidas++;
      }
    }
    if (enviadas > 0 || pendientes.length === 0) marcarUltimaSync();
  } finally {
    sincronizando = false;
  }
  return { enviadas, fallidas };
}

export async function hayPendientes(): Promise<boolean> {
  const n = await db.actas.where('estado').anyOf('pendiente', 'error').count();
  return n > 0;
}

export function iniciarSyncAutomatico() {
  window.addEventListener('online', () => {
    sincronizarPendientes();
    leerFotosEnCola();
  });
  // Reintento periódico por si la conexión es intermitente pero el navegador
  // no dispara el evento "online" de forma confiable (común en zonas rurales).
  setInterval(() => {
    sincronizarPendientes();
    leerFotosEnCola();
  }, 30_000);
}

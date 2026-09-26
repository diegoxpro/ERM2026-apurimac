import type { ActaSyncResult } from '@erm2026/shared';
import { apiFetch, ApiError } from './api';
import { db } from './db';

let sincronizando = false;

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
            resultados: acta.resultados,
            observaciones: acta.observaciones,
            digitadaEn: acta.digitadaEn,
          }),
        });
        await db.actas.update(acta.clienteId, { estado: 'sincronizada', actaId: result.actaId, ultimoError: undefined });
        enviadas++;
      } catch (e) {
        const mensaje = e instanceof ApiError ? e.message : 'Error de red';
        await db.actas.update(acta.clienteId, { estado: 'error', ultimoError: mensaje });
        fallidas++;
      }
    }
  } finally {
    sincronizando = false;
  }
  return { enviadas, fallidas };
}

export function iniciarSyncAutomatico() {
  window.addEventListener('online', () => {
    sincronizarPendientes();
  });
  // Reintento periódico por si la conexión es intermitente pero el navegador
  // no dispara el evento "online" de forma confiable (común en zonas rurales).
  setInterval(() => {
    sincronizarPendientes();
  }, 30_000);
}

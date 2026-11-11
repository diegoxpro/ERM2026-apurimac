import type { CedulaMesaDTO } from '@erm2026/shared';
import { apiFetch } from './api';
import { db, cachearMesa, getMesasCacheadas } from './db';

export interface MesaResumen {
  id: string;
  codigo: string;
  localVotacion: string;
  distrito: string;
  provincia: string;
  electores: number;
  actasRegistradas: number;
  actasEsperadas: number;
}

const MESAS_COUNT_KEY = 'erm2026_personero_mesas_count';
// Última vuelta activa que informó el servidor. Sirve para no mostrar offline
// una cédula cacheada de la vuelta anterior (p. ej. la de 4 cuerpos de primera
// vuelta cuando ya se está en segunda).
const VUELTA_KEY = 'erm2026_personero_vuelta';

function vueltaConocida(): string {
  return localStorage.getItem(VUELTA_KEY) ?? 'PRIMERA';
}

export function getMesasAsignadasCount(): number {
  return parseInt(localStorage.getItem(MESAS_COUNT_KEY) ?? '0', 10) || 0;
}

export async function obtenerMesasAsignadas(): Promise<MesaResumen[]> {
  if (navigator.onLine) {
    try {
      const data = await apiFetch<{ items: MesaResumen[] }>('/api/mesas?mine=true&limit=50');
      localStorage.setItem(MESAS_COUNT_KEY, String(data.items.length));
      apiFetch<{ vuelta: string }>('/api/config')
        .then((c) => localStorage.setItem(VUELTA_KEY, c.vuelta))
        .catch(() => {});
      return data.items;
    } catch {
      // Cae al catálogo offline si la llamada falla.
    }
  }
  const cacheadas = (await getMesasCacheadas()).filter((c) => (c.vuelta ?? 'PRIMERA') === vueltaConocida());
  return cacheadas.map((c) => ({
    id: c.mesaId,
    codigo: c.mesaCodigo,
    localVotacion: c.localVotacion,
    distrito: c.distrito,
    provincia: c.provincia,
    electores: c.electoresHabiles,
    actasRegistradas: c.columnas.filter((col) => col.estado !== 'SIN_REGISTRAR').length,
    actasEsperadas: c.columnas.length,
  }));
}

export async function obtenerCedula(mesaId: string): Promise<CedulaMesaDTO> {
  if (navigator.onLine) {
    const data = await apiFetch<CedulaMesaDTO>(`/api/mesas/${mesaId}/cedula`);
    localStorage.setItem(VUELTA_KEY, data.vuelta);
    await cachearMesa(data);
    return conEstadoLocal(data);
  }
  const cache = await db.mesas.get(mesaId);
  if (!cache || (cache.data.vuelta ?? 'PRIMERA') !== vueltaConocida()) {
    throw new Error('No hay datos guardados de esta mesa para la vuelta actual. Conéctate a internet al menos una vez.');
  }
  return conEstadoLocal(cache.data);
}

// Superpone el estado de actas guardadas localmente (aún no sincronizadas)
// sobre la cédula, para que el personero vea "Enviada" aunque esté offline.
async function conEstadoLocal(base: CedulaMesaDTO): Promise<CedulaMesaDTO> {
  const vuelta = base.vuelta ?? 'PRIMERA';
  const locales = (await db.actas.where('mesaId').equals(base.mesaId).toArray()).filter(
    (a) => (a.vuelta ?? 'PRIMERA') === vuelta
  );
  if (locales.length === 0) return base;
  const porCargo = new Map(locales.map((a) => [a.cargo, a]));
  return {
    ...base,
    columnas: base.columnas.map((col) => {
      const local = porCargo.get(col.cargo);
      if (!local || col.estado !== 'SIN_REGISTRAR') return col;
      return { ...col, estado: local.estado === 'error' ? 'SIN_REGISTRAR' : 'ENVIADA' };
    }),
  };
}

export function tituloCorto(cargo: string): string {
  switch (cargo) {
    case 'GOBERNADOR_REGIONAL':
      return 'Gobernador regional';
    case 'CONSEJERO_REGIONAL':
      return 'Consejero regional';
    case 'ALCALDE_PROVINCIAL':
      return 'Alcalde provincial';
    case 'ALCALDE_DISTRITAL':
      return 'Alcalde distrital';
    default:
      return cargo;
  }
}

export const ESTADO_LABEL: Record<string, string> = {
  SIN_REGISTRAR: 'Sin registrar',
  ENVIADA: 'Enviada',
  VALIDADA: 'Validada',
  OBSERVADA: 'Observada',
};

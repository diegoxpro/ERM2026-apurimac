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
  // false = el personero no tiene asignada esta mesa, pero envió (o tiene por enviar) un acta de ella.
  asignada: boolean;
}

const MESAS_COUNT_KEY = 'erm2026_personero_mesas_count';
const ASIGNADAS_KEY = 'erm2026_personero_mesas_asignadas';

// Cantidad de mesas en "Mis mesas" (asignadas + las de actas enviadas por el personero).
export function getMesasAsignadasCount(): number {
  return parseInt(localStorage.getItem(MESAS_COUNT_KEY) ?? '0', 10) || 0;
}

function getIdsAsignadas(): Set<string> | null {
  const raw = localStorage.getItem(ASIGNADAS_KEY);
  if (!raw) return null;
  try {
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return null;
  }
}

function resumenDeCache(c: CedulaMesaDTO, asignada: boolean): MesaResumen {
  return {
    id: c.mesaId,
    codigo: c.mesaCodigo,
    localVotacion: c.localVotacion,
    distrito: c.distrito,
    provincia: c.provincia,
    electores: c.electoresHabiles,
    actasRegistradas: c.columnas.filter((col) => col.estado !== 'SIN_REGISTRAR').length,
    actasEsperadas: c.columnas.length,
    asignada,
  };
}

// "Mis mesas": las asignadas al personero más las mesas no asignadas de las que él
// envió un acta (en el servidor) o tiene un acta guardada en este teléfono.
export async function obtenerMesasAsignadas(): Promise<MesaResumen[]> {
  const mesasConActaLocal = new Set(
    (await db.actas.toArray()).filter((a) => a.estado !== 'duplicada' && a.estado !== 'duplicada_vista').map((a) => a.mesaId),
  );
  const cacheadas = await getMesasCacheadas();

  let lista: MesaResumen[] | null = null;
  if (navigator.onLine) {
    try {
      const data = await apiFetch<{ items: MesaResumen[] }>('/api/mesas?mine=true&limit=50');
      lista = data.items.map((m) => ({ ...m, asignada: m.asignada !== false }));
      localStorage.setItem(ASIGNADAS_KEY, JSON.stringify(lista.filter((m) => m.asignada).map((m) => m.id)));
    } catch {
      // Cae al catálogo offline si la llamada falla.
    }
  }

  if (lista === null) {
    const asignadas = getIdsAsignadas();
    lista = cacheadas
      .filter((c) => !asignadas || asignadas.has(c.mesaId) || mesasConActaLocal.has(c.mesaId))
      .map((c) => resumenDeCache(c, !asignadas || asignadas.has(c.mesaId)));
  } else {
    // Actas guardadas en el teléfono que el servidor aún no tiene (sin señal o sync pendiente).
    const enLista = new Set(lista.map((m) => m.id));
    for (const c of cacheadas) {
      if (!enLista.has(c.mesaId) && mesasConActaLocal.has(c.mesaId)) lista.push(resumenDeCache(c, false));
    }
  }

  lista.sort((a, b) => Number(b.asignada) - Number(a.asignada) || a.codigo.localeCompare(b.codigo));
  localStorage.setItem(MESAS_COUNT_KEY, String(lista.length));
  return lista;
}

export async function obtenerCedula(mesaId: string): Promise<CedulaMesaDTO> {
  if (navigator.onLine) {
    const data = await apiFetch<CedulaMesaDTO>(`/api/mesas/${mesaId}/cedula`);
    await cachearMesa(data);
    return conEstadoLocal(data);
  }
  const cache = await db.mesas.get(mesaId);
  if (!cache) throw new Error('No hay datos guardados de esta mesa. Conéctate a internet al menos una vez.');
  return conEstadoLocal(cache.data);
}

// Superpone el estado de actas guardadas localmente (aún no sincronizadas)
// sobre la cédula, para que el personero vea "Enviada" aunque esté offline.
async function conEstadoLocal(base: CedulaMesaDTO): Promise<CedulaMesaDTO> {
  const locales = await db.actas.where('mesaId').equals(base.mesaId).toArray();
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

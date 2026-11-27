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
  // false = no está asignada a este personero, pero envió (o tiene guardada) un acta de ella.
  asignada?: boolean;
}

const MESAS_PROPIAS_KEY = 'erm2026_personero_mesas_propias';

// null = aún no se sabe (instalación anterior a este cambio): se asumen todas las guardadas.
function getIdsAsignadas(): Set<string> | null {
  const raw = localStorage.getItem(MESAS_PROPIAS_KEY);
  if (raw === null) return null;
  try {
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return null;
  }
}

function resumenDesdeCedula(c: CedulaMesaDTO, asignada: boolean): MesaResumen {
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

// Mesas no asignadas de las que hay un acta guardada en este teléfono (aunque aún
// no se haya enviado): también deben aparecer en "Mis mesas".
// Con señal, el servidor ya lista las mesas cuyas actas se enviaron: aquí solo
// faltan las que tienen actas todavía sin enviar (soloPendientes).
async function mesasConActaLocal(excluir: Set<string>, soloPendientes = false): Promise<MesaResumen[]> {
  const actas = await db.actas.toArray();
  const relevantes = actas.filter((a) => (soloPendientes ? a.estado === 'pendiente' || a.estado === 'error' : !a.estado.startsWith('duplicada')));
  const ids = [...new Set(relevantes.map((a) => a.mesaId))].filter((id) => !excluir.has(id));
  const extra: MesaResumen[] = [];
  for (const id of ids) {
    const cache = await db.mesas.get(id);
    if (cache) extra.push(resumenDesdeCedula(await conEstadoLocal(cache.data), false));
  }
  return extra;
}

const MESAS_COUNT_KEY = 'erm2026_personero_mesas_count';

export function getMesasAsignadasCount(): number {
  return parseInt(localStorage.getItem(MESAS_COUNT_KEY) ?? '0', 10) || 0;
}

export async function obtenerMesasAsignadas(): Promise<MesaResumen[]> {
  if (navigator.onLine) {
    try {
      const data = await apiFetch<{ items: MesaResumen[] }>('/api/mesas?mine=true&limit=50');
      const asignadas = data.items.filter((m) => m.asignada !== false).map((m) => m.id);
      localStorage.setItem(MESAS_PROPIAS_KEY, JSON.stringify(asignadas));
      // Mesas sin ninguna acta en el servidor: se olvidan las copias locales ya enviadas
      // (p. ej. un administrador borró actas de prueba).
      for (const m of data.items) if (m.actasRegistradas === 0) await olvidarActasBorradas(m.id, null);
      const items = [...data.items, ...(await mesasConActaLocal(new Set(data.items.map((m) => m.id)), true))];
      localStorage.setItem(MESAS_COUNT_KEY, String(items.length));
      return items;
    } catch {
      // Cae al catálogo offline si la llamada falla.
    }
  }
  // Sin señal: las asignadas que están guardadas + las no asignadas con acta en el teléfono.
  const propias = getIdsAsignadas();
  const cacheadas = await getMesasCacheadas();
  const asignadas = cacheadas.filter((c) => !propias || propias.has(c.mesaId));
  const lista = await Promise.all(asignadas.map(async (c) => resumenDesdeCedula(await conEstadoLocal(c), true)));
  return [...lista, ...(await mesasConActaLocal(new Set(lista.map((m) => m.id))))];
}

export async function obtenerCedula(mesaId: string): Promise<CedulaMesaDTO> {
  if (navigator.onLine) {
    const data = await apiFetch<CedulaMesaDTO>(`/api/mesas/${mesaId}/cedula`);
    await cachearMesa(data);
    const sinRegistrar = new Set(data.columnas.filter((c) => c.estado === 'SIN_REGISTRAR').map((c) => c.cargo));
    await olvidarActasBorradas(mesaId, sinRegistrar);
    return conEstadoLocal(data);
  }
  const cache = await db.mesas.get(mesaId);
  if (!cache) throw new Error('No hay datos guardados de esta mesa. Conéctate a internet al menos una vez.');
  return conEstadoLocal(cache.data);
}

// El servidor es la fuente de verdad: si dice que un cargo de la mesa no tiene
// acta, la copia local marcada como enviada (o duplicada) ya no vale y se borra.
// Las actas pendientes o con error NO se tocan: todavía no llegaron al servidor.
// cargos = null significa "todos los cargos de la mesa".
async function olvidarActasBorradas(mesaId: string, cargos: Set<string> | null) {
  const locales = await db.actas.where('mesaId').equals(mesaId).toArray();
  const borrar = locales.filter(
    (a) => (a.estado === 'sincronizada' || a.estado.startsWith('duplicada')) && (cargos === null || cargos.has(a.cargo)),
  );
  if (borrar.length) await db.actas.bulkDelete(borrar.map((a) => a.clienteId));
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

import Dexie, { type Table } from 'dexie';
import type { Cargo, CatalogoDTO, ResultadoInput } from '@erm2026/shared';

export interface ActaLocal {
  clienteId: string;
  mesaId: string;
  mesaCodigo: string;
  cargo: Cargo;
  resultados: ResultadoInput[];
  observaciones?: string;
  digitadaEn: string;
  estado: 'pendiente' | 'sincronizada' | 'error';
  ultimoError?: string;
  actaId?: string;
}

export interface CatalogoCache {
  id: string;
  data: CatalogoDTO;
  descargadoEn: string;
}

class ERM2026DB extends Dexie {
  catalogo!: Table<CatalogoCache, string>;
  actas!: Table<ActaLocal, string>;

  constructor() {
    super('erm2026');
    this.version(1).stores({
      catalogo: 'id',
      actas: 'clienteId, estado, mesaId, digitadaEn, [mesaId+cargo]',
    });
  }
}

export const db = new ERM2026DB();

export const CATALOGO_CACHE_ID = 'catalogo-apurimac-2026';

export async function getCatalogoCache(): Promise<CatalogoDTO | null> {
  const row = await db.catalogo.get(CATALOGO_CACHE_ID);
  return row?.data ?? null;
}

export async function setCatalogoCache(data: CatalogoDTO) {
  await db.catalogo.put({ id: CATALOGO_CACHE_ID, data, descargadoEn: new Date().toISOString() });
}

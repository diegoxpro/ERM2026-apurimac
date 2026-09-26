import Dexie, { type Table } from 'dexie';
import type { Cargo, CedulaMesaDTO, ResultadoInput } from '@erm2026/shared';

export interface ActaLocal {
  clienteId: string;
  mesaId: string;
  mesaCodigo: string;
  cargo: Cargo;
  resultados: ResultadoInput[];
  observaciones?: string;
  fotoDataUrl?: string; // solo local: la foto del acta física no se sincroniza con el servidor.
  digitadaEn: string;
  estado: 'pendiente' | 'sincronizada' | 'error';
  ultimoError?: string;
  actaId?: string;
}

export interface MesaCache {
  mesaId: string;
  data: CedulaMesaDTO;
  descargadaEn: string;
}

class PersoneroDB extends Dexie {
  actas!: Table<ActaLocal, string>;
  mesas!: Table<MesaCache, string>;

  constructor() {
    super('erm2026_personero');
    this.version(1).stores({
      actas: 'clienteId, estado, mesaId, digitadaEn, [mesaId+cargo]',
      mesas: 'mesaId',
    });
  }
}

export const db = new PersoneroDB();

export async function cachearMesa(data: CedulaMesaDTO) {
  await db.mesas.put({ mesaId: data.mesaId, data, descargadaEn: new Date().toISOString() });
}

export async function getMesasCacheadas(): Promise<CedulaMesaDTO[]> {
  const filas = await db.mesas.toArray();
  return filas.map((f) => f.data);
}

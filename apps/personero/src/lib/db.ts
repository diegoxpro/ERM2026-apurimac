import Dexie, { type Table } from 'dexie';
import { ELECCION, type Cargo, type CedulaMesaDTO, type LecturaActaDTO, type ResultadoInput } from '@erm2026/shared';

export interface ActaLocal {
  clienteId: string;
  mesaId: string;
  mesaCodigo: string;
  cargo: Cargo;
  resultados: ResultadoInput[];
  observaciones?: string;
  fotoDataUrl?: string; // solo local: la foto del acta física no se sincroniza con el servidor.
  digitadaEn: string;
  totalEmitidosActa?: number;
  leidaPorIA?: boolean;
  // duplicada: el servidor ya tenía esa acta (enviada por otra persona); duplicada_vista: el personero ya vio el aviso.
  estado: 'pendiente' | 'sincronizada' | 'error' | 'duplicada' | 'duplicada_vista';
  ultimoError?: string;
  actaId?: string;
}

// Foto tomada sin señal: se guarda aquí y la IA la lee al volver la conexión.
// Clave = `${mesaId}|${cargo}`, una por cargo de mesa.
export interface FotoPorLeer {
  clave: string;
  mesaId: string;
  cargo: Cargo;
  fotoDataUrl: string;
  tomadaEn: string;
  estado: 'esperando' | 'leida' | 'error';
  lectura?: LecturaActaDTO;
  error?: string;
}

export interface MesaCache {
  mesaId: string;
  data: CedulaMesaDTO;
  descargadaEn: string;
}

class PersoneroDB extends Dexie {
  actas!: Table<ActaLocal, string>;
  mesas!: Table<MesaCache, string>;
  fotosPorLeer!: Table<FotoPorLeer, string>;

  constructor() {
    super(`erm2026_personero_${ELECCION.regionMayus}`);
    this.version(1).stores({
      actas: 'clienteId, estado, mesaId, digitadaEn, [mesaId+cargo]',
      mesas: 'mesaId',
    });
    this.version(2).stores({
      actas: 'clienteId, estado, mesaId, digitadaEn, [mesaId+cargo]',
      mesas: 'mesaId',
      fotosPorLeer: 'clave, estado, mesaId',
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

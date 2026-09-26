export {
  construirColumnasCedula,
  construirCedulaMesa,
  type MesaCatalogoItem,
  type ListaCatalogoItem,
  type CatalogoDTO,
} from './cedula';

export type Cargo =
  | 'GOBERNADOR_REGIONAL'
  | 'CONSEJERO_REGIONAL'
  | 'ALCALDE_PROVINCIAL'
  | 'ALCALDE_DISTRITAL';

export type RolUsuario = 'ADMIN' | 'SUPERVISOR' | 'DIGITADOR';

export type EstadoActa = 'PENDIENTE' | 'DIGITADA' | 'OBSERVADA';

export type TipoResultado = 'VOTO_LISTA' | 'BLANCO' | 'NULO' | 'IMPUGNADO';

export interface ListaCandidaturaDTO {
  id: string;
  cargo: Cargo;
  organizacion: string;
  simboloUrl: string | null;
  orden: number;
}

export interface ColumnaCedulaDTO {
  cargo: Cargo;
  titulo: string;
  listas: ListaCandidaturaDTO[];
}

export interface CedulaMesaDTO {
  mesaId: string;
  mesaCodigo: string;
  provincia: string;
  distrito: string;
  localVotacion: string;
  electoresHabiles: number;
  columnas: ColumnaCedulaDTO[];
}

export interface ResultadoInput {
  cargo: Cargo;
  listaCandidaturaId: string | null;
  tipo: TipoResultado;
  votos: number;
}

export interface ActaSyncInput {
  clienteId: string; // id generado en el dispositivo (uuid) para idempotencia
  mesaId: string;
  digitadorId: string;
  resultados: ResultadoInput[];
  observaciones?: string;
  digitadaEn: string; // ISO date, hora local del dispositivo al momento de guardar
}

export interface ActaSyncResult {
  clienteId: string;
  actaId: string;
  estado: EstadoActa;
}

export interface AvanceProvinciaDTO {
  provincia: string;
  totalMesas: number;
  mesasDigitadas: number;
}

export interface ResumenGobernadorDTO {
  organizacion: string;
  simboloUrl: string | null;
  votos: number;
}

export interface DashboardResumenDTO {
  totalMesas: number;
  mesasDigitadas: number;
  porcentajeAvance: number;
  avancePorProvincia: AvanceProvinciaDTO[];
  resultadosGobernadorRegional: ResumenGobernadorDTO[];
  totalBlancos: number;
  totalNulos: number;
  totalImpugnados: number;
}

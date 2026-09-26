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

export type RolUsuario = 'ADMIN' | 'COORDINADOR' | 'PERSONERO';

export type EstadoActa = 'ENVIADA' | 'VALIDADA' | 'OBSERVADA';
export type EstadoCargoMesa = 'SIN_REGISTRAR' | EstadoActa;

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
  estado: EstadoCargoMesa;
  actaId: string | null;
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
  listaCandidaturaId: string | null;
  tipo: TipoResultado;
  votos: number;
}

export interface ActaSyncInput {
  clienteId: string; // id generado en el dispositivo (uuid) para idempotencia
  mesaId: string;
  cargo: Cargo;
  resultados: ResultadoInput[];
  observaciones?: string;
  digitadaEn: string; // ISO date, hora local del dispositivo al momento de guardar
}

export interface ActaSyncResult {
  clienteId: string;
  actaId: string;
  estado: EstadoActa;
}

// --- Usuarios ---

export interface UsuarioDTO {
  id: string;
  nombre: string;
  dni: string;
  email: string | null;
  telefono: string | null;
  rol: RolUsuario;
  activo: boolean;
  coordinadorId: string | null;
  coordinadorNombre: string | null;
  createdAt: string;
}

export interface CrearUsuarioInput {
  nombre: string;
  dni: string;
  email?: string;
  telefono?: string;
  rol: RolUsuario;
  password: string;
  coordinadorId?: string | null;
}

export interface ActualizarUsuarioInput {
  nombre?: string;
  email?: string;
  telefono?: string;
  activo?: boolean;
  coordinadorId?: string | null;
  password?: string;
}

// --- Locales y mesas ---

export interface LocalDTO {
  id: string;
  codigo: string;
  nombre: string;
  direccion: string | null;
  distrito: string;
  provincia: string;
  totalMesas: number;
}

export interface CrearLocalInput {
  codigo: string;
  nombre: string;
  direccion?: string;
  provincia: string;
  distrito: string;
}

export interface MesaDTO {
  id: string;
  codigo: string;
  electores: number;
  electoresDiscapacidad: number;
  personeroId: string | null;
  personeroNombre: string | null;
}

export interface CrearMesaInput {
  codigo: string;
  electores: number;
  electoresDiscapacidad?: number;
  personeroId?: string | null;
}

export interface DniConsultaDTO {
  dni: string;
  nombre: string;
}

// --- Resultados / dashboard ---

export interface ResultadoOrganizacionDTO {
  organizacion: string;
  simboloUrl: string | null;
  votos: number;
  porcentaje: number;
}

export interface ResultadosPorCargoDTO {
  cargo: Cargo;
  titulo: string;
  organizaciones: ResultadoOrganizacionDTO[];
  validos: number;
  blancos: number;
  nulos: number;
  impugnados: number;
}

export interface AvanceProvinciaDTO {
  provincia: string;
  totalMesas: number;
  mesasDigitadas: number;
}

export interface ResultadosResumenDTO {
  actasRecibidas: number;
  actasEsperadas: number;
  validadas: number;
  mesasCubiertas: number;
  personerosActivos: number;
  incidencias: number;
  incidenciasAltas: number;
  avancePorProvincia: AvanceProvinciaDTO[];
  porCargo: ResultadosPorCargoDTO[];
}

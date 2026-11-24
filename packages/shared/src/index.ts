export {
  construirColumnasCedula,
  construirCedulaMesa,
  type MesaCatalogoItem,
  type ListaCatalogoItem,
  type CatalogoDTO,
} from './cedula';

// Elección que cubre este despliegue. Se muestra en ambas apps (panel y PWA).
// La región sale de VITE_REGION al construir (Vite la reemplaza vía "define"
// en apps/web y apps/personero); sin ella, queda Lambayeque.
declare const process: { env: Record<string, string | undefined> };
let regionDespliegue = 'Lambayeque';
try {
  regionDespliegue = process.env.VITE_REGION || regionDespliegue;
} catch {
  // En el navegador sin "define" no existe process: se usa el valor por defecto.
}

export const ELECCION = {
  region: regionDespliegue,
  regionMayus: regionDespliegue.toUpperCase(),
  nombre: 'Elecciones Regionales 2026 — Segunda Vuelta',
} as const;

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
  fotoBase64?: string; // foto del acta física, comprimida en el dispositivo antes de enviarse
  digitadaEn: string; // ISO date, hora local del dispositivo al momento de guardar
  personeroId?: string; // solo panel admin: registrar a nombre de un personero
  // "Total de votos emitidos" escrito en el acta física. Si no coincide con la
  // suma de los resultados, el servidor deja el acta OBSERVADA.
  totalEmitidosActa?: number;
  leidaPorIA?: boolean; // los números vinieron del lector de actas (y la persona los revisó)
}

// --- Configuración (solo administrador) ---

export interface ModeloLectorDTO {
  id: string;
  nombre: string;
  detalle: string;
}

export interface ConfigLectorDTO {
  activo: boolean;
  modelo: string;
  modelos: ModeloLectorDTO[];
  tieneApiKey: boolean;
  apiKeyFinal: string | null; // últimos 4 caracteres, para reconocerla sin mostrarla
  origenClave: 'panel' | 'servidor' | null;
}

export interface BackupDTO {
  nombre: string;
  bytes: number;
  creadoEn: string;
}

// --- Lector de actas por foto (IA) ---

export interface LeerActaInput {
  fotoBase64: string; // data URL JPEG comprimida en el dispositivo
  mesaId?: string; // si ya se sabe de qué mesa es (formulario abierto)
  cargo?: Cargo;
}

export interface LecturaActaDTO {
  mesaCodigoLeido: string;
  mesaId: string | null; // null si el número leído no existe en el padrón
  mesaCodigo: string | null;
  cargo: Cargo | null;
  // listaCandidaturaId -> votos leídos (null = casilla vacía o ilegible)
  votosPorLista: Record<string, number | null>;
  blanco: number | null;
  nulo: number | null;
  impugnado: number | null;
  totalEmitidos: number | null;
  electoresHabilesLeido: number | null;
  avisos: string[]; // cosas que la persona debe revisar (dudas de la IA, no cuadra, etc.)
  // Si esa mesa + cargo ya tiene un acta registrada en el servidor.
  yaEnviada?: { actaId: string; estado: EstadoActa; personeroNombre: string; digitadaEn: string } | null;
}

export interface ActaSyncResult {
  clienteId: string;
  actaId: string;
  estado: EstadoActa;
}

export interface ResultadoDetalleDTO extends ResultadoInput {
  organizacion?: string | null;
  simboloUrl?: string | null;
}

export interface DetalleActaDTO {
  id: string;
  estado: EstadoActa;
  digitadaEn: string;
  personeroNombre: string;
  observaciones: string | null;
  fotoBase64: string | null;
  resultados: ResultadoDetalleDTO[];
}

// --- Actas recibidas (panel admin) ---

export interface ActaResumenDTO {
  id: string;
  mesaId: string;
  mesaCodigo: string;
  cargo: Cargo;
  localVotacion: string;
  distrito: string;
  provincia: string;
  personeroNombre: string;
  estado: EstadoActa;
  digitadaEn: string;
  electoresHabiles: number;
  tieneFoto: boolean;
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
  password?: string; // opcional para PERSONERO (entran solo con DNI)
  coordinadorId?: string | null;
}

// --- Carga masiva de usuarios (Excel) ---

export interface FilaImportacionDTO {
  fila: number; // número de fila en el Excel
  dni: string;
  nombre: string;
  rol: RolUsuario | null;
  dependeDe: string;
  correo: string;
  telefono: string;
  mesas: string[];
  accion: 'crear' | 'actualizar' | 'error';
  errores: string[];
  avisos: string[];
}

export interface ResultadoImportacionDTO {
  creados: number;
  actualizados: number;
  omitidos: number;
  mesasAsignadas: number;
  // Contraseñas temporales de admins/coordinadores nuevos: se muestran una sola vez.
  credenciales: { dni: string; nombre: string; rol: RolUsuario; password: string }[];
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

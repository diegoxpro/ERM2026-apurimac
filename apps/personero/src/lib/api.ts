// Vacío = mismo origen (nginx enruta /api hacia el backend).
// En desarrollo local, apps/personero/.env define VITE_API_URL=http://localhost:4000.
const API_URL = import.meta.env.VITE_API_URL ?? '';

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

// Se lanza cuando el token JWT venció o el servidor lo rechazó. La app muestra
// el aviso "Tu sesión expiró" con el botón para cerrar sesión y volver a ingresar.
export class SesionExpiradaError extends ApiError {
  constructor() {
    super(401, 'Tu sesión expiró. Cierra sesión e ingresa de nuevo.');
  }
}

export const EVENTO_SESION_EXPIRADA = 'erm2026:sesion-expirada';

function avisarSesionExpirada() {
  window.dispatchEvent(new Event(EVENTO_SESION_EXPIRADA));
}

export function getToken(): string | null {
  return localStorage.getItem('erm2026_personero_token');
}

// Momento (ms) en que vence el token, leído del campo "exp" del JWT. null si no se puede leer.
export function vencimientoToken(token: string | null = getToken()): number | null {
  if (!token) return null;
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const { exp } = JSON.parse(atob(payload)) as { exp?: number };
    return typeof exp === 'number' ? exp * 1000 : null;
  } catch {
    return null;
  }
}

export function tokenVencido(token: string | null = getToken()): boolean {
  const vence = vencimientoToken(token);
  return vence !== null && Date.now() >= vence;
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const esLogin = path.startsWith('/api/auth/');
  // Token ya vencido: no gastamos datos enviando (p.ej. una foto) algo que el servidor rechazará.
  if (!esLogin && token && tokenVencido(token)) {
    avisarSesionExpirada();
    throw new SesionExpiradaError();
  }
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const body = isJson ? await res.json() : null;

  if (!res.ok) {
    if (res.status === 401 && token && !esLogin) {
      avisarSesionExpirada();
      throw new SesionExpiradaError();
    }
    throw new ApiError(res.status, body?.error ?? `Error ${res.status}`, body);
  }
  return body as T;
}

export { API_URL };

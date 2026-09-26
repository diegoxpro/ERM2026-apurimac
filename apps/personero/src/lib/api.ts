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

function getToken(): string | null {
  return localStorage.getItem('erm2026_personero_token');
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const body = isJson ? await res.json() : null;

  if (!res.ok) {
    throw new ApiError(res.status, body?.error ?? `Error ${res.status}`, body);
  }
  return body as T;
}

export { API_URL };

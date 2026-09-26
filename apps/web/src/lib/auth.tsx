import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { RolUsuario } from '@erm2026/shared';
import { apiFetch } from './api';

interface UsuarioSesion {
  id: string;
  nombre: string;
  rol: RolUsuario;
}

interface AuthContextValue {
  usuario: UsuarioSesion | null;
  cargando: boolean;
  login: (dni: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = 'erm2026_token';
const USUARIO_KEY = 'erm2026_usuario';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<UsuarioSesion | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const raw = localStorage.getItem(USUARIO_KEY);
    if (raw) {
      try {
        setUsuario(JSON.parse(raw));
      } catch {
        localStorage.removeItem(USUARIO_KEY);
      }
    }
    setCargando(false);
  }, []);

  async function login(dni: string, password: string) {
    const res = await apiFetch<{ token: string; usuario: UsuarioSesion }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ dni, password }),
    });
    localStorage.setItem(TOKEN_KEY, res.token);
    localStorage.setItem(USUARIO_KEY, JSON.stringify(res.usuario));
    setUsuario(res.usuario);
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USUARIO_KEY);
    setUsuario(null);
  }

  return <AuthContext.Provider value={{ usuario, cargando, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { RolUsuario } from '@erm2026/shared';
import { apiFetch, EVENTO_SESION_EXPIRADA, getToken, tokenVencido } from './api';

interface UsuarioSesion {
  id: string;
  nombre: string;
  rol: RolUsuario;
}

interface AuthContextValue {
  usuario: UsuarioSesion | null;
  cargando: boolean;
  login: (dni: string, password: string) => Promise<UsuarioSesion>;
  logout: () => void;
  /** true cuando el token venció o el servidor lo rechazó: la app muestra el aviso para volver a ingresar. */
  sesionExpirada: boolean;
  /** Oculta el aviso unos minutos (p.ej. para terminar de digitar sin señal). */
  posponerAviso: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = 'erm2026_token';
const USUARIO_KEY = 'erm2026_usuario';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<UsuarioSesion | null>(null);
  const [cargando, setCargando] = useState(true);
  const [sesionExpirada, setSesionExpirada] = useState(false);
  const pospuestoHasta = useRef(0);

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

  // Detecta la sesión vencida: al abrir la app, cada 30 s, al volver a la pestaña
  // y cuando una llamada al servidor responde 401.
  useEffect(() => {
    if (!usuario) {
      setSesionExpirada(false);
      return;
    }
    const mostrar = () => {
      if (Date.now() >= pospuestoHasta.current) setSesionExpirada(true);
    };
    const revisar = () => {
      if (!getToken() || tokenVencido()) mostrar();
    };
    revisar();
    const intervalo = window.setInterval(revisar, 30_000);
    window.addEventListener(EVENTO_SESION_EXPIRADA, mostrar);
    document.addEventListener('visibilitychange', revisar);
    return () => {
      window.clearInterval(intervalo);
      window.removeEventListener(EVENTO_SESION_EXPIRADA, mostrar);
      document.removeEventListener('visibilitychange', revisar);
    };
  }, [usuario]);

  function posponerAviso() {
    pospuestoHasta.current = Date.now() + 2 * 60_000;
    setSesionExpirada(false);
  }

  async function login(dni: string, password: string) {
    const res = await apiFetch<{ token: string; usuario: UsuarioSesion }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ dni, password }),
    });
    localStorage.setItem(TOKEN_KEY, res.token);
    localStorage.setItem(USUARIO_KEY, JSON.stringify(res.usuario));
    setUsuario(res.usuario);
    return res.usuario;
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USUARIO_KEY);
    setUsuario(null);
    setSesionExpirada(false);
    pospuestoHasta.current = 0;
  }

  return <AuthContext.Provider value={{ usuario, cargando, login, logout, sesionExpirada, posponerAviso }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}

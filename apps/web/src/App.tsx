import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './lib/auth';
import Sidebar from './components/Sidebar';
import SesionExpirada from './components/SesionExpirada';
import { IconLogout } from './components/Icons';
import Login from './pages/Login';
import LlenarActas from './pages/LlenarActas';
import Resultados from './pages/Resultados';
import Usuarios from './pages/Usuarios';
import LocalesYMesas from './pages/LocalesYMesas';
import Asignacion from './pages/Asignacion';
import ActasRecibidas from './pages/ActasRecibidas';
import Configuracion from './pages/Configuracion';

function useEnLinea() {
  const [enLinea, setEnLinea] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setEnLinea(true);
    const off = () => setEnLinea(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return enLinea;
}

const ROL_LABEL: Record<string, string> = {
  ADMIN: 'Administrador global',
  COORDINADOR: 'Coordinador',
  PERSONERO: 'Personero',
};

function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/);
  return ((partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? '')).toUpperCase();
}

function Layout({ children }: { children: ReactNode }) {
  const { usuario, logout } = useAuth();
  const enLinea = useEnLinea();
  if (!usuario) return null;

  return (
    <div className="app-shell-sidebar">
      <Sidebar rol={usuario.rol} />
      <div className="main-area">
        <header className="topbar">
          <span className={`badge-conexion ${enLinea ? 'online' : 'offline'}`}>
            {enLinea ? 'En línea' : 'Sin conexión'}
          </span>
          <div className="usuario-info">
            <div className="nombre">{usuario.nombre}</div>
            <div className="rol">{ROL_LABEL[usuario.rol] ?? usuario.rol}</div>
          </div>
          <div className="avatar">{iniciales(usuario.nombre)}</div>
          <button className="icon-btn" onClick={logout} title="Cerrar sesión" aria-label="Cerrar sesión">
            <IconLogout />
          </button>
        </header>
        <div className="page">{children}</div>
      </div>
    </div>
  );
}

// Rutas que ve el coordinador; cualquier otra lo devuelve a Resultados.
const RUTAS_COORDINADOR = ['/resultados', '/mesas-actas'];

function RutaPrivada({ children }: { children: ReactNode }) {
  const { usuario, cargando } = useAuth();
  const location = useLocation();
  if (cargando) return null;
  if (!usuario) return <Navigate to="/login" replace />;
  if (usuario.rol === 'COORDINADOR' && !RUTAS_COORDINADOR.includes(location.pathname)) {
    return <Navigate to="/resultados" replace />;
  }
  return <Layout>{children}</Layout>;
}

function rutaInicial(rol?: string): string {
  if (rol === 'PERSONERO') return '/llenar-actas';
  return '/resultados';
}

export default function App() {
  const { usuario, cargando } = useAuth();
  if (cargando) return null;

  return (
    <>
    <SesionExpirada />
    <Routes>
      <Route path="/login" element={usuario ? <Navigate to={rutaInicial(usuario.rol)} replace /> : <Login />} />
      <Route
        path="/resultados"
        element={
          <RutaPrivada>
            <Resultados />
          </RutaPrivada>
        }
      />
      <Route
        path="/usuarios"
        element={
          <RutaPrivada>
            <Usuarios />
          </RutaPrivada>
        }
      />
      <Route
        path="/locales"
        element={
          <RutaPrivada>
            <LocalesYMesas />
          </RutaPrivada>
        }
      />
      <Route
        path="/asignacion"
        element={
          <RutaPrivada>
            <Asignacion />
          </RutaPrivada>
        }
      />
      <Route
        path="/actas"
        element={
          <RutaPrivada>
            <ActasRecibidas />
          </RutaPrivada>
        }
      />
      <Route
        path="/llenar-actas"
        element={
          <RutaPrivada>
            <LlenarActas />
          </RutaPrivada>
        }
      />
      <Route
        path="/mesas-actas"
        element={
          <RutaPrivada>
            <LlenarActas modo="coordinador" />
          </RutaPrivada>
        }
      />
      <Route
        path="/configuracion"
        element={
          <RutaPrivada>
            <Configuracion />
          </RutaPrivada>
        }
      />
      <Route path="*" element={<Navigate to={usuario ? rutaInicial(usuario.rol) : '/login'} replace />} />
    </Routes>
    </>
  );
}

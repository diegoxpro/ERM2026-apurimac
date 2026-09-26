import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, Link, useLocation } from 'react-router-dom';
import { useAuth } from './lib/auth';
import Login from './pages/Login';
import Digitador from './pages/Digitador';
import Supervisor from './pages/Supervisor';

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

function Layout({ children }: { children: React.ReactNode }) {
  const { usuario, logout } = useAuth();
  const enLinea = useEnLinea();
  const location = useLocation();

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1>ERM2026 Apurímac — Conteo Rápido</h1>
          {usuario && <div className="usuario">{usuario.nombre} · {usuario.rol}</div>}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className={`badge-conexion ${enLinea ? 'online' : 'offline'}`}>
            {enLinea ? 'En línea' : 'Sin conexión'}
          </span>
          {usuario && (
            <button className="secundario" style={{ width: 'auto' }} onClick={logout}>
              Salir
            </button>
          )}
        </div>
      </header>
      <div className="contenido">
        {usuario?.rol === 'SUPERVISOR' || usuario?.rol === 'ADMIN' ? (
          <nav className="tabs">
            <Link className={location.pathname === '/digitador' ? 'activo' : ''} to="/digitador">
              Digitar acta
            </Link>
            <Link className={location.pathname === '/supervisor' ? 'activo' : ''} to="/supervisor">
              Dashboard
            </Link>
          </nav>
        ) : null}
        {children}
      </div>
    </div>
  );
}

function RutaPrivada({ children }: { children: React.ReactNode }) {
  const { usuario, cargando } = useAuth();
  if (cargando) return null;
  if (!usuario) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

export default function App() {
  const { usuario, cargando } = useAuth();
  if (cargando) return null;

  return (
    <Routes>
      <Route path="/login" element={usuario ? <Navigate to="/digitador" replace /> : <Login />} />
      <Route
        path="/digitador"
        element={
          <RutaPrivada>
            <Digitador />
          </RutaPrivada>
        }
      />
      <Route
        path="/supervisor"
        element={
          <RutaPrivada>
            <Supervisor />
          </RutaPrivada>
        }
      />
      <Route path="*" element={<Navigate to={usuario ? '/digitador' : '/login'} replace />} />
    </Routes>
  );
}

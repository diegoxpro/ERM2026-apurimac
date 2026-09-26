import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import Login from './pages/Login';
import Home from './pages/Home';
import MesaDetalle from './pages/MesaDetalle';
import CargoFormulario from './pages/CargoFormulario';

function RutaPrivada({ children }: { children: JSX.Element }) {
  const { usuario, cargando } = useAuth();
  if (cargando) return <div className="pantalla-carga" />;
  if (!usuario) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  const { usuario, cargando } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={cargando ? <div className="pantalla-carga" /> : usuario ? <Navigate to="/" replace /> : <Login />} />
      <Route
        path="/"
        element={
          <RutaPrivada>
            <Home />
          </RutaPrivada>
        }
      />
      <Route
        path="/mesa/:mesaId"
        element={
          <RutaPrivada>
            <MesaDetalle />
          </RutaPrivada>
        }
      />
      <Route
        path="/mesa/:mesaId/cargo/:cargo"
        element={
          <RutaPrivada>
            <CargoFormulario />
          </RutaPrivada>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

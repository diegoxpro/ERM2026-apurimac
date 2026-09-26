import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { ApiError } from '../lib/api';
import { IconShieldCheck } from '../components/Icons';
import InstallGuide from './InstallGuide';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [dni, setDni] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [mostrarGuia, setMostrarGuia] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setCargando(true);
    try {
      await login(dni, password);
      navigate('/', { replace: true });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo conectar al servidor');
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="pantalla-login">
      <div className="login-tarjeta">
        <div className="login-icono">
          <IconShieldCheck />
        </div>
        <h1>Personeros</h1>
        <p>Ingresa con tu DNI y contraseña</p>

        {error && <div className="mensaje error">{error}</div>}

        <form onSubmit={onSubmit}>
          <div className="form-row">
            <label htmlFor="dni">DNI</label>
            <input
              id="dni"
              value={dni}
              onChange={(e) => setDni(e.target.value.replace(/\D/g, '').slice(0, 8))}
              inputMode="numeric"
              placeholder="12345678"
              required
              autoFocus
            />
          </div>
          <div className="form-row">
            <label htmlFor="password">Contraseña</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn btn-login" disabled={cargando}>
            {cargando ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>

        <button type="button" className="enlace-instalar" onClick={() => setMostrarGuia(true)}>
          ¿Cómo instalar la app?
        </button>
      </div>

      <p className="login-pie">Conteo rápido no oficial — Apurímac 2026</p>

      {mostrarGuia && <InstallGuide onCerrar={() => setMostrarGuia(false)} />}
    </div>
  );
}

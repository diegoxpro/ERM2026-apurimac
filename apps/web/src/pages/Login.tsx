import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { ApiError } from '../lib/api';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [dni, setDni] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setCargando(true);
    try {
      await login(dni, password);
      navigate('/digitador');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo conectar al servidor');
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="app-shell">
      <div className="contenido" style={{ maxWidth: 360, marginTop: '15vh' }}>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Ingresar</h2>
          <p style={{ fontSize: 13, color: '#555' }}>Conteo rápido no oficial — Apurímac 2026</p>
          {error && <div className="mensaje error">{error}</div>}
          <form onSubmit={onSubmit}>
            <div className="form-row">
              <label htmlFor="dni">DNI</label>
              <input id="dni" value={dni} onChange={(e) => setDni(e.target.value)} required autoFocus />
            </div>
            <div className="form-row">
              <label htmlFor="password">Contraseña</label>
              <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <button type="submit" disabled={cargando}>
              {cargando ? 'Ingresando...' : 'Ingresar'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { ApiError } from '../lib/api';
import { IconClipboard } from '../components/Icons';

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
      const usuario = await login(dni, password);
      navigate(usuario.rol === 'PERSONERO' ? '/llenar-actas' : '/resultados');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo conectar al servidor');
    } finally {
      setCargando(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-fondo)' }}>
      <div className="card" style={{ maxWidth: 360, width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <span
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: 'var(--color-primario)',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <IconClipboard />
          </span>
          <h2 style={{ margin: 0 }}>Panel de Personeros</h2>
        </div>
        <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>Conteo rápido no oficial — Apurímac 2026</p>
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
          <button type="submit" className="btn" style={{ width: '100%', justifyContent: 'center' }} disabled={cargando}>
            {cargando ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  );
}

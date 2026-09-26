import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import type { DashboardResumenDTO } from '@erm2026/shared';
import { apiFetch, API_URL, ApiError } from '../lib/api';

export default function Supervisor() {
  const [resumen, setResumen] = useState<DashboardResumenDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actualizando, setActualizando] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function cargar() {
    setActualizando(true);
    try {
      const data = await apiFetch<DashboardResumenDTO>('/api/dashboard/resumen');
      setResumen(data);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo cargar el dashboard');
    } finally {
      setActualizando(false);
    }
  }

  useEffect(() => {
    cargar();
    timerRef.current = setInterval(cargar, 20_000);

    const socket = io(API_URL, { transports: ['websocket'] });
    socket.on('acta:sincronizada', () => cargar());

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      socket.disconnect();
    };
  }, []);

  if (error && !resumen) return <div className="mensaje error">{error}</div>;
  if (!resumen) return <p>Cargando...</p>;

  return (
    <div>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Avance general {actualizando && '(actualizando...)'}</h3>
        <p style={{ fontSize: 24, fontWeight: 700, margin: '4px 0' }}>
          {resumen.mesasDigitadas} / {resumen.totalMesas} mesas ({resumen.porcentajeAvance}%)
        </p>
        <div className="barra-avance">
          <div style={{ width: `${resumen.porcentajeAvance}%` }} />
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Avance por provincia</h3>
        <table className="resumen">
          <thead>
            <tr>
              <th>Provincia</th>
              <th>Digitadas</th>
              <th>Total</th>
              <th>%</th>
            </tr>
          </thead>
          <tbody>
            {resumen.avancePorProvincia.map((p) => (
              <tr key={p.provincia}>
                <td>{p.provincia}</td>
                <td>{p.mesasDigitadas}</td>
                <td>{p.totalMesas}</td>
                <td>{p.totalMesas > 0 ? Math.round((p.mesasDigitadas / p.totalMesas) * 100) : 0}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Gobernador y Vicegobernador Regional</h3>
        <table className="resumen">
          <thead>
            <tr>
              <th>Organización política</th>
              <th>Votos</th>
            </tr>
          </thead>
          <tbody>
            {resumen.resultadosGobernadorRegional.map((r) => (
              <tr key={r.organizacion}>
                <td>{r.organizacion}</td>
                <td>{r.votos}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ fontSize: 12, color: '#666', marginTop: 8 }}>
          Blancos: {resumen.totalBlancos} · Nulos: {resumen.totalNulos} · Impugnados: {resumen.totalImpugnados}
        </p>
      </div>
    </div>
  );
}

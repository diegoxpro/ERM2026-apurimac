import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import type { Cargo, ResultadosResumenDTO } from '@erm2026/shared';
import { apiFetch, API_URL, ApiError } from '../lib/api';
import { IconFile, IconCheck, IconUsers, IconBell } from '../components/Icons';

const CARGOS: Cargo[] = ['GOBERNADOR_REGIONAL', 'CONSEJERO_REGIONAL', 'ALCALDE_PROVINCIAL', 'ALCALDE_DISTRITAL'];
const CARGO_LABEL: Record<Cargo, string> = {
  GOBERNADOR_REGIONAL: 'Gobernador regional',
  CONSEJERO_REGIONAL: 'Consejero regional',
  ALCALDE_PROVINCIAL: 'Alcalde provincial',
  ALCALDE_DISTRITAL: 'Alcalde distrital',
};

export default function Resultados() {
  const [resumen, setResumen] = useState<ResultadosResumenDTO | null>(null);
  const [provincia, setProvincia] = useState('');
  const [cargoActivo, setCargoActivo] = useState<Cargo>('GOBERNADOR_REGIONAL');
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function cargar(prov: string) {
    try {
      const qs = prov ? `?provincia=${encodeURIComponent(prov)}` : '';
      const data = await apiFetch<ResultadosResumenDTO>(`/api/resultados${qs}`);
      setResumen(data);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo cargar los resultados');
    }
  }

  useEffect(() => {
    cargar(provincia);
    timerRef.current = setInterval(() => cargar(provincia), 20_000);
    const socket = io(API_URL || window.location.origin, { transports: ['websocket'], path: '/socket.io/' });
    socket.on('acta:sincronizada', () => cargar(provincia));
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provincia]);

  if (error && !resumen) return <div className="mensaje error">{error}</div>;
  if (!resumen) return <p>Cargando…</p>;

  const cargo = resumen.porCargo.find((c) => c.cargo === cargoActivo) ?? resumen.porCargo[0];
  const porcentajeAvance = resumen.actasEsperadas > 0 ? Math.round((resumen.actasRecibidas / resumen.actasEsperadas) * 1000) / 10 : 0;

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Resultados</h2>
          <p>Avance de la jornada y conteo por organización política</p>
        </div>
        <div className="filtros">
          <select value="regionales" onChange={() => {}} disabled title="Por ahora solo hay una elección configurada">
            <option value="regionales">Elecciones Regionales y Municipales</option>
          </select>
          <select value={provincia} onChange={(e) => setProvincia(e.target.value)}>
            <option value="">Todas las provincias</option>
            {resumen.avancePorProvincia.map((p) => (
              <option key={p.provincia} value={p.provincia}>
                {p.provincia}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="stat-cards">
        <div className="stat-card">
          <div className="stat-cabecera">
            <span className="stat-titulo">Actas recibidas</span>
            <span className="stat-icono">
              <IconFile />
            </span>
          </div>
          <div className="stat-valor">
            {resumen.actasRecibidas} / {resumen.actasEsperadas}
          </div>
          <div className="stat-detalle">{porcentajeAvance}% de avance</div>
        </div>
        <div className="stat-card">
          <div className="stat-cabecera">
            <span className="stat-titulo">Validadas</span>
            <span className="stat-icono">
              <IconCheck />
            </span>
          </div>
          <div className="stat-valor">{resumen.validadas}</div>
          <div className="stat-detalle">de {resumen.actasRecibidas} recibidas</div>
        </div>
        <div className="stat-card">
          <div className="stat-cabecera">
            <span className="stat-titulo">Mesas cubiertas</span>
            <span className="stat-icono">
              <IconUsers />
            </span>
          </div>
          <div className="stat-valor">{resumen.mesasCubiertas}</div>
          <div className="stat-detalle">{resumen.personerosActivos} personeros activos</div>
        </div>
        <div className="stat-card">
          <div className="stat-cabecera">
            <span className="stat-titulo">Incidencias</span>
            <span className="stat-icono">
              <IconBell />
            </span>
          </div>
          <div className="stat-valor">{resumen.incidencias}</div>
          <div className="stat-detalle">{resumen.incidenciasAltas} de gravedad alta</div>
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h3 style={{ margin: 0 }}>Conteo por organización</h3>
            <p style={{ margin: 0, fontSize: 12.5, color: '#6b7280' }}>
              {resumen.actasRecibidas} actas · {resumen.mesasCubiertas} mesas contabilizadas
            </p>
          </div>
          <div className="tabs-cargo">
            {CARGOS.map((c) => (
              <button key={c} className={c === cargoActivo ? 'activo' : ''} onClick={() => setCargoActivo(c)}>
                {CARGO_LABEL[c]}
              </button>
            ))}
          </div>
        </div>

        {cargo.organizaciones.length === 0 && <div className="vacio">Aún no hay resultados registrados para este cargo.</div>}

        {cargo.organizaciones.map((org) => (
          <div key={org.organizacion} className="resultado-org">
            {org.simboloUrl && <img src={org.simboloUrl} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} />}
            <div className="nombre-barra">
              <div className="nombre">{org.organizacion}</div>
              <div className="barra-avance">
                <div style={{ width: `${org.porcentaje}%` }} />
              </div>
            </div>
            <div className="cifras">
              {org.porcentaje}%<span className="votos">{org.votos}</span>
            </div>
          </div>
        ))}

        <div className="totales-fila">
          <div className="item">
            <span className="valor">{cargo.validos}</span>
            <span className="etiqueta">Votos válidos</span>
          </div>
          <div className="item">
            <span className="valor">{cargo.blancos}</span>
            <span className="etiqueta">En blanco</span>
          </div>
          <div className="item">
            <span className="valor">{cargo.nulos}</span>
            <span className="etiqueta">Nulos</span>
          </div>
          <div className="item">
            <span className="valor">{cargo.impugnados}</span>
            <span className="etiqueta">Impugnados</span>
          </div>
        </div>
      </div>
    </div>
  );
}

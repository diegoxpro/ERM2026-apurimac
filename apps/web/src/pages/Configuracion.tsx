import { useEffect, useState } from 'react';
import type { BackupDTO, ConfigLectorDTO } from '@erm2026/shared';
import { apiFetch, ApiError, API_URL } from '../lib/api';
import { useAuth } from '../lib/auth';
import { IconDownload } from '../components/Icons';

type Pestana = 'respaldos' | 'lector';

export default function Configuracion() {
  const { usuario } = useAuth();
  const [pestana, setPestana] = useState<Pestana>('respaldos');

  if (usuario?.rol !== 'ADMIN') {
    return <div className="vacio">Solo el administrador puede ver la configuración.</div>;
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Configuración</h2>
          <p>Respaldos de la base de datos y lectura de actas con IA.</p>
        </div>
      </div>

      <div className="tabs-config">
        <button className={pestana === 'respaldos' ? 'activo' : ''} onClick={() => setPestana('respaldos')}>
          Respaldos
        </button>
        <button className={pestana === 'lector' ? 'activo' : ''} onClick={() => setPestana('lector')}>
          Lectura con IA
        </button>
      </div>

      {pestana === 'respaldos' ? <Respaldos /> : <LectorIA />}
    </div>
  );
}

function tamano(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function Respaldos() {
  const [datos, setDatos] = useState<{ disponible: boolean; items: BackupDTO[] } | null>(null);
  const [creando, setCreando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null);

  async function cargar() {
    try {
      setDatos(await apiFetch('/api/configuracion/backups'));
    } catch (e) {
      setMensaje({ tipo: 'error', texto: e instanceof ApiError ? e.message : 'No se pudieron cargar los respaldos' });
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  async function crear() {
    setCreando(true);
    setMensaje(null);
    try {
      const b = await apiFetch<BackupDTO>('/api/configuracion/backups', { method: 'POST' });
      setMensaje({ tipo: 'exito', texto: `Respaldo creado: ${b.nombre} (${tamano(b.bytes)}).` });
      await cargar();
    } catch (e) {
      setMensaje({ tipo: 'error', texto: e instanceof ApiError ? e.message : 'No se pudo crear el respaldo' });
    } finally {
      setCreando(false);
    }
  }

  async function descargar(nombre: string) {
    setMensaje(null);
    try {
      const res = await fetch(`${API_URL}/api/configuracion/backups/${encodeURIComponent(nombre)}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('erm2026_token') ?? ''}` },
      });
      if (!res.ok) throw new Error();
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = nombre;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      setMensaje({ tipo: 'error', texto: 'No se pudo descargar el respaldo' });
    }
  }

  return (
    <div className="card">
      <div className="config-encabezado">
        <div>
          <h3>Respaldos de la base de datos</h3>
          <p className="subtexto">
            El servidor crea uno cada hora y los conserva 14 días. Para restaurar uno, sigue la guía de despliegue (sección
            Respaldos).
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn secundario" onClick={cargar} title="Actualizar">
            Actualizar
          </button>
          <button className="btn" onClick={crear} disabled={creando}>
            {creando ? 'Creando respaldo…' : 'Crear respaldo ahora'}
          </button>
        </div>
      </div>

      {mensaje && <div className={`mensaje ${mensaje.tipo}`}>{mensaje.texto}</div>}

      {!datos && <div className="vacio">Cargando…</div>}
      {datos && !datos.disponible && (
        <div className="vacio">La carpeta de respaldos no está disponible en este servidor. Crea uno para iniciarla.</div>
      )}
      {datos && datos.disponible && datos.items.length === 0 && <div className="vacio">Todavía no hay respaldos.</div>}
      {datos && datos.items.length > 0 && (
        <table className="tabla">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Archivo</th>
              <th>Tamaño</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {datos.items.map((b, i) => (
              <tr key={b.nombre}>
                <td>
                  {new Date(b.creadoEn).toLocaleString('es-PE')}
                  {i === 0 && <span className="badge-estado VALIDADA" style={{ marginLeft: 8 }}>Último</span>}
                </td>
                <td className="subtexto">{b.nombre}</td>
                <td>{tamano(b.bytes)}</td>
                <td style={{ textAlign: 'right' }}>
                  <button className="btn pequeno secundario" onClick={() => descargar(b.nombre)}>
                    <IconDownload /> Descargar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function LectorIA() {
  const [cfg, setCfg] = useState<ConfigLectorDTO | null>(null);
  const [nuevaClave, setNuevaClave] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [probando, setProbando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null);

  useEffect(() => {
    apiFetch<ConfigLectorDTO>('/api/configuracion/lector')
      .then(setCfg)
      .catch((e) => setMensaje({ tipo: 'error', texto: e instanceof ApiError ? e.message : 'No se pudo cargar la configuración' }));
  }, []);

  async function guardar(cambios: Partial<{ activo: boolean; modelo: string; apiKey: string | null }>, texto: string) {
    setGuardando(true);
    setMensaje(null);
    try {
      setCfg(await apiFetch<ConfigLectorDTO>('/api/configuracion/lector', { method: 'PUT', body: JSON.stringify(cambios) }));
      setMensaje({ tipo: 'exito', texto });
      return true;
    } catch (e) {
      setMensaje({ tipo: 'error', texto: e instanceof ApiError ? e.message : 'No se pudo guardar' });
      return false;
    } finally {
      setGuardando(false);
    }
  }

  async function probar() {
    setProbando(true);
    setMensaje(null);
    try {
      const r = await apiFetch<{ ok: boolean; mensaje?: string; error?: string }>('/api/configuracion/lector/probar', { method: 'POST' });
      setMensaje(r.ok ? { tipo: 'exito', texto: r.mensaje! } : { tipo: 'error', texto: r.error! });
    } catch (e) {
      setMensaje({ tipo: 'error', texto: e instanceof ApiError ? e.message : 'No se pudo probar la conexión' });
    } finally {
      setProbando(false);
    }
  }

  if (!cfg) return <div className="card">{mensaje ? <div className={`mensaje ${mensaje.tipo}`}>{mensaje.texto}</div> : <div className="vacio">Cargando…</div>}</div>;

  return (
    <div className="card">
      <div className="config-encabezado">
        <div>
          <h3>Lectura de actas con IA</h3>
          <p className="subtexto">
            Coordinadores y personeros toman la foto del acta, la IA llena los votos y la persona los revisa antes de enviar.
          </p>
        </div>
        <label className="interruptor">
          <input type="checkbox" checked={cfg.activo} disabled={guardando} onChange={(e) => guardar({ activo: e.target.checked }, e.target.checked ? 'Lectura con IA activada.' : 'Lectura con IA desactivada: se digita a mano.')} />
          <span>{cfg.activo ? 'Activada' : 'Desactivada'}</span>
        </label>
      </div>

      {mensaje && <div className={`mensaje ${mensaje.tipo}`}>{mensaje.texto}</div>}

      <div className="form-row">
        <label>Modelo de IA</label>
        <div className="opciones-modelo">
          {cfg.modelos.map((m) => (
            <label key={m.id} className={`opcion-modelo ${cfg.modelo === m.id ? 'activa' : ''}`}>
              <input type="radio" name="modelo" checked={cfg.modelo === m.id} disabled={guardando} onChange={() => guardar({ modelo: m.id }, `Modelo cambiado a ${m.nombre}.`)} />
              <div>
                <strong>{m.nombre}</strong>
                <div className="subtexto">{m.detalle}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      <div className="form-row">
        <label>Clave de API de Anthropic</label>
        <p className="subtexto" style={{ margin: '0 0 8px', fontSize: 13 }}>
          {cfg.tieneApiKey
            ? `Configurada (termina en …${cfg.apiKeyFinal}, ${cfg.origenClave === 'panel' ? 'guardada en el panel' : 'del servidor'}).`
            : 'Sin clave: la lectura con IA no funcionará. Créala en console.anthropic.com → API Keys.'}
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            type="password"
            autoComplete="off"
            placeholder="sk-ant-…"
            value={nuevaClave}
            onChange={(e) => setNuevaClave(e.target.value)}
            style={{ flex: 1, minWidth: 220 }}
          />
          <button
            className="btn"
            disabled={guardando || !nuevaClave.trim()}
            onClick={async () => {
              if (await guardar({ apiKey: nuevaClave.trim() }, 'Clave guardada.')) setNuevaClave('');
            }}
          >
            Guardar clave
          </button>
          {cfg.origenClave === 'panel' && (
            <button className="btn peligro" disabled={guardando} onClick={() => guardar({ apiKey: null }, 'Clave del panel eliminada.')}>
              Quitar
            </button>
          )}
        </div>
      </div>

      <button className="btn secundario" onClick={probar} disabled={probando || !cfg.tieneApiKey}>
        {probando ? 'Probando…' : 'Probar conexión'}
      </button>
    </div>
  );
}

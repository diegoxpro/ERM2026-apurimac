import { useEffect, useState, type FormEvent } from 'react';
import type { CrearLocalInput, LocalDTO, MesaDTO } from '@erm2026/shared';
import { apiFetch, ApiError } from '../lib/api';

interface GeoProvincia {
  nombre: string;
  distritos: { nombre: string; capitalDeProvincia: boolean }[];
}

export default function LocalesYMesas() {
  const [locales, setLocales] = useState<LocalDTO[] | null>(null);
  const [geo, setGeo] = useState<GeoProvincia[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [provincia, setProvincia] = useState('');
  const [mostrarModal, setMostrarModal] = useState(false);
  const [localMesas, setLocalMesas] = useState<LocalDTO | null>(null);
  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null);

  async function cargar() {
    const params = new URLSearchParams();
    if (busqueda) params.set('search', busqueda);
    if (provincia) params.set('provincia', provincia);
    try {
      const data = await apiFetch<LocalDTO[]>(`/api/locales?${params.toString()}`);
      setLocales(data);
    } catch (e) {
      setMensaje({ tipo: 'error', texto: e instanceof ApiError ? e.message : 'No se pudo cargar la lista de locales' });
    }
  }

  useEffect(() => {
    apiFetch<GeoProvincia[]>('/api/locales/geo').then(setGeo).catch(() => {});
  }, []);

  useEffect(() => {
    const t = setTimeout(cargar, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda, provincia]);

  async function eliminar(local: LocalDTO) {
    if (local.totalMesas > 0) {
      setMensaje({ tipo: 'error', texto: 'No se puede eliminar un local que todavía tiene mesas.' });
      return;
    }
    if (!confirm(`¿Eliminar el local "${local.nombre}"?`)) return;
    try {
      await apiFetch(`/api/locales/${local.id}`, { method: 'DELETE' });
      cargar();
    } catch (e) {
      setMensaje({ tipo: 'error', texto: e instanceof ApiError ? e.message : 'No se pudo eliminar el local' });
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Locales y mesas</h2>
          <p>Cada local pertenece a un distrito, y de ahí sale la cédula de sus mesas</p>
        </div>
        <button className="btn" onClick={() => setMostrarModal(true)}>
          + Nuevo local
        </button>
      </div>

      {mensaje && <div className={`mensaje ${mensaje.tipo}`}>{mensaje.texto}</div>}

      <div className="card">
        <div className="toolbar">
          <div className="buscador">
            <input placeholder="Buscar local o dirección" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
          </div>
          <select value={provincia} onChange={(e) => setProvincia(e.target.value)}>
            <option value="">Todas las provincias</option>
            {geo.map((p) => (
              <option key={p.nombre} value={p.nombre}>
                {p.nombre}
              </option>
            ))}
          </select>
        </div>

        {locales && locales.length === 0 && <div className="vacio">No se encontraron locales.</div>}

        {locales && locales.length > 0 && (
          <table className="tabla">
            <thead>
              <tr>
                <th>Local</th>
                <th>Distrito</th>
                <th>Provincia</th>
                <th>Mesas</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {locales.map((l) => (
                <tr key={l.id}>
                  <td>
                    <strong>{l.nombre}</strong>
                    <div className="subtexto">{l.direccion}</div>
                  </td>
                  <td>{l.distrito}</td>
                  <td>{l.provincia}</td>
                  <td>{l.totalMesas}</td>
                  <td style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button className="btn pequeno secundario" onClick={() => setLocalMesas(l)}>
                      Mesas
                    </button>
                    <button className="btn pequeno peligro" onClick={() => eliminar(l)}>
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {mostrarModal && (
        <ModalNuevoLocal
          geo={geo}
          onCerrar={() => setMostrarModal(false)}
          onCreado={() => {
            setMostrarModal(false);
            cargar();
          }}
        />
      )}

      {localMesas && <ModalMesas local={localMesas} onCerrar={() => setLocalMesas(null)} onCambio={cargar} />}
    </div>
  );
}

function ModalNuevoLocal({ geo, onCerrar, onCreado }: { geo: GeoProvincia[]; onCerrar: () => void; onCreado: () => void }) {
  const [codigo, setCodigo] = useState('');
  const [nombre, setNombre] = useState('');
  const [direccion, setDireccion] = useState('');
  const [provincia, setProvincia] = useState('');
  const [distrito, setDistrito] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const distritos = geo.find((p) => p.nombre === provincia)?.distritos ?? [];

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setGuardando(true);
    try {
      const input: CrearLocalInput = { codigo, nombre, direccion: direccion || undefined, provincia, distrito };
      await apiFetch('/api/locales', { method: 'POST', body: JSON.stringify(input) });
      onCreado();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo crear el local');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="modal-fondo" onClick={onCerrar}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Nuevo local de votación</h3>
          <button onClick={onCerrar}>×</button>
        </div>
        {error && <div className="mensaje error">{error}</div>}
        <form onSubmit={onSubmit}>
          <div className="form-grid">
            <div className="form-row">
              <label>Código</label>
              <input value={codigo} onChange={(e) => setCodigo(e.target.value)} required autoFocus />
            </div>
            <div className="form-row">
              <label>Nombre</label>
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} required />
            </div>
          </div>
          <div className="form-row">
            <label>Dirección (opcional)</label>
            <input value={direccion} onChange={(e) => setDireccion(e.target.value)} />
          </div>
          <div className="form-grid">
            <div className="form-row">
              <label>Provincia</label>
              <select
                value={provincia}
                onChange={(e) => {
                  setProvincia(e.target.value);
                  setDistrito('');
                }}
                required
              >
                <option value="">Selecciona…</option>
                {geo.map((p) => (
                  <option key={p.nombre} value={p.nombre}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-row">
              <label>Distrito</label>
              <select value={distrito} onChange={(e) => setDistrito(e.target.value)} required disabled={!provincia}>
                <option value="">Selecciona…</option>
                {distritos.map((d) => (
                  <option key={d.nombre} value={d.nombre}>
                    {d.nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn secundario" onClick={onCerrar}>
              Cancelar
            </button>
            <button type="submit" className="btn" disabled={guardando}>
              {guardando ? 'Creando…' : 'Crear local'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ModalMesas({ local, onCerrar, onCambio }: { local: LocalDTO; onCerrar: () => void; onCambio: () => void }) {
  const [mesas, setMesas] = useState<MesaDTO[] | null>(null);
  const [mostrarNueva, setMostrarNueva] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [electores, setElectores] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function cargar() {
    const data = await apiFetch<{ items: MesaDTO[] }>(`/api/mesas?localId=${local.id}&limit=200`);
    setMesas(data.items);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local.id]);

  async function crearMesa(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setGuardando(true);
    try {
      await apiFetch('/api/mesas', {
        method: 'POST',
        body: JSON.stringify({ localVotacionId: local.id, codigo, electores: parseInt(electores, 10) || 0 }),
      });
      setCodigo('');
      setElectores('');
      setMostrarNueva(false);
      await cargar();
      onCambio();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo crear la mesa');
    } finally {
      setGuardando(false);
    }
  }

  async function eliminarMesa(m: MesaDTO) {
    if (!confirm(`¿Eliminar la mesa ${m.codigo}?`)) return;
    try {
      await apiFetch(`/api/mesas/${m.id}`, { method: 'DELETE' });
      await cargar();
      onCambio();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo eliminar la mesa (¿ya tiene actas?)');
    }
  }

  return (
    <div className="modal-fondo" onClick={onCerrar}>
      <div className="modal ancho" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>Mesas de {local.nombre}</h3>
            <p>
              {local.distrito}, {local.provincia}
            </p>
          </div>
          <button onClick={onCerrar}>×</button>
        </div>
        {error && <div className="mensaje error">{error}</div>}

        {mesas && mesas.length > 0 && (
          <table className="tabla">
            <thead>
              <tr>
                <th>Código</th>
                <th>Electores</th>
                <th>Personero</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {mesas.map((m) => (
                <tr key={m.id}>
                  <td>{m.codigo}</td>
                  <td>{m.electores}</td>
                  <td>{m.personeroNombre ?? '—'}</td>
                  <td>
                    <button className="btn pequeno peligro" onClick={() => eliminarMesa(m)}>
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {mesas && mesas.length === 0 && <div className="vacio">Este local todavía no tiene mesas.</div>}

        {mostrarNueva ? (
          <form onSubmit={crearMesa} style={{ marginTop: 14, borderTop: '1px solid var(--color-borde)', paddingTop: 14 }}>
            <div className="form-grid">
              <div className="form-row">
                <label>Código de mesa</label>
                <input value={codigo} onChange={(e) => setCodigo(e.target.value)} required autoFocus />
              </div>
              <div className="form-row">
                <label>Electores hábiles</label>
                <input type="number" min={0} value={electores} onChange={(e) => setElectores(e.target.value)} required />
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn secundario" onClick={() => setMostrarNueva(false)}>
                Cancelar
              </button>
              <button type="submit" className="btn" disabled={guardando}>
                {guardando ? 'Creando…' : 'Agregar mesa'}
              </button>
            </div>
          </form>
        ) : (
          <button className="btn secundario" style={{ marginTop: 14 }} onClick={() => setMostrarNueva(true)}>
            + Agregar mesa
          </button>
        )}
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import type { LocalDTO, MesaDTO, UsuarioDTO } from '@erm2026/shared';
import { apiFetch, ApiError } from '../lib/api';

interface GeoProvincia {
  nombre: string;
  distritos: { nombre: string; capitalDeProvincia: boolean }[];
}

export default function Asignacion() {
  const [geo, setGeo] = useState<GeoProvincia[]>([]);
  const [provincia, setProvincia] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [locales, setLocales] = useState<LocalDTO[] | null>(null);
  const [localSeleccionado, setLocalSeleccionado] = useState<LocalDTO | null>(null);
  const [mesas, setMesas] = useState<MesaDTO[] | null>(null);
  const [personeros, setPersoneros] = useState<UsuarioDTO[]>([]);
  const [guardandoId, setGuardandoId] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null);

  useEffect(() => {
    apiFetch<GeoProvincia[]>('/api/locales/geo').then(setGeo).catch(() => {});
    apiFetch<UsuarioDTO[]>('/api/usuarios?rol=PERSONERO&estado=activo')
      .then(setPersoneros)
      .catch(() => setMensaje({ tipo: 'error', texto: 'No se pudo cargar la lista de personeros' }));
  }, []);

  useEffect(() => {
    const t = setTimeout(async () => {
      const params = new URLSearchParams();
      if (busqueda) params.set('search', busqueda);
      if (provincia) params.set('provincia', provincia);
      try {
        const data = await apiFetch<LocalDTO[]>(`/api/locales?${params.toString()}`);
        setLocales(data);
      } catch {
        setLocales(null);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [busqueda, provincia]);

  async function abrirLocal(local: LocalDTO) {
    setLocalSeleccionado(local);
    setMesas(null);
    setMensaje(null);
    try {
      const data = await apiFetch<{ items: MesaDTO[] }>(`/api/mesas?localId=${local.id}&limit=300`);
      setMesas(data.items);
    } catch (e) {
      setMensaje({ tipo: 'error', texto: e instanceof ApiError ? e.message : 'No se pudo cargar las mesas de este local' });
    }
  }

  async function asignar(mesa: MesaDTO, personeroId: string) {
    setGuardandoId(mesa.id);
    setMensaje(null);
    try {
      await apiFetch(`/api/mesas/${mesa.id}`, {
        method: 'PUT',
        body: JSON.stringify({ personeroId: personeroId || null }),
      });
      const personero = personeros.find((p) => p.id === personeroId);
      setMesas((prev) =>
        prev
          ? prev.map((m) => (m.id === mesa.id ? { ...m, personeroId: personeroId || null, personeroNombre: personero?.nombre ?? null } : m))
          : prev
      );
    } catch (e) {
      setMensaje({ tipo: 'error', texto: e instanceof ApiError ? e.message : 'No se pudo guardar la asignación' });
    } finally {
      setGuardandoId(null);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Asignación de mesas</h2>
          <p>Elige un local de votación y asigna un personero a cada una de sus mesas.</p>
        </div>
      </div>

      {mensaje && <div className={`mensaje ${mensaje.tipo}`}>{mensaje.texto}</div>}

      <div className="layout-asignacion">
        <div className="card panel-locales">
          <div className="toolbar" style={{ marginBottom: 12 }}>
            <div className="buscador">
              <input placeholder="Buscar local" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
            </div>
          </div>
          <select value={provincia} onChange={(e) => setProvincia(e.target.value)} style={{ marginBottom: 12 }}>
            <option value="">Todas las provincias</option>
            {geo.map((p) => (
              <option key={p.nombre} value={p.nombre}>
                {p.nombre}
              </option>
            ))}
          </select>

          {locales && locales.length === 0 && <div className="vacio">No se encontraron locales.</div>}

          <div className="lista-locales">
            {(locales ?? []).map((l) => (
              <button
                key={l.id}
                className={`item-local ${localSeleccionado?.id === l.id ? 'activo' : ''}`}
                onClick={() => abrirLocal(l)}
              >
                <strong>{l.nombre}</strong>
                <span className="subtexto">
                  {l.distrito}, {l.provincia} · {l.totalMesas} mesas
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="card panel-mesas">
          {!localSeleccionado && <div className="vacio">Elige un local de votación de la lista para ver y asignar sus mesas.</div>}

          {localSeleccionado && (
            <>
              <div className="page-header" style={{ marginBottom: 14 }}>
                <div>
                  <h3 style={{ margin: '0 0 2px' }}>{localSeleccionado.nombre}</h3>
                  <p style={{ margin: 0 }}>
                    {localSeleccionado.distrito}, {localSeleccionado.provincia}
                  </p>
                </div>
              </div>

              {mesas === null && <p className="subtexto">Cargando mesas…</p>}
              {mesas && mesas.length === 0 && <div className="vacio">Este local todavía no tiene mesas registradas.</div>}

              {mesas && mesas.length > 0 && (
                <table className="tabla">
                  <thead>
                    <tr>
                      <th>Mesa</th>
                      <th>Electores</th>
                      <th>Personero asignado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mesas.map((m) => (
                      <tr key={m.id}>
                        <td>
                          <strong>{m.codigo}</strong>
                        </td>
                        <td>{m.electores}</td>
                        <td>
                          <select
                            value={m.personeroId ?? ''}
                            onChange={(e) => asignar(m, e.target.value)}
                            disabled={guardandoId === m.id}
                          >
                            <option value="">Sin asignar</option>
                            {personeros.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.nombre} (DNI {p.dni})
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

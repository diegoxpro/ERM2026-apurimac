import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { CatalogoDTO, ColumnaCedulaDTO, ResultadoInput } from '@erm2026/shared';
import { construirCedulaMesa, type MesaCatalogoItem } from '@erm2026/shared';
import { apiFetch, ApiError } from '../lib/api';
import { db, getCatalogoCache, setCatalogoCache } from '../lib/db';
import { sincronizarPendientes } from '../lib/sync';

type ConteoColumna = Record<string, { votos: Record<string, number>; blanco: number; nulo: number; impugnado: number }>;

function columnaVacia(columnas: ColumnaCedulaDTO[]): ConteoColumna {
  const inicial: ConteoColumna = {};
  for (const col of columnas) {
    inicial[col.cargo] = { votos: {}, blanco: 0, nulo: 0, impugnado: 0 };
  }
  return inicial;
}

export default function Digitador() {
  const [catalogo, setCatalogo] = useState<CatalogoDTO | null>(null);
  const [descargando, setDescargando] = useState(false);
  const [errorCatalogo, setErrorCatalogo] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [mesaSeleccionada, setMesaSeleccionada] = useState<MesaCatalogoItem | null>(null);
  const [conteo, setConteo] = useState<ConteoColumna>({});
  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error' | 'info'; texto: string } | null>(null);
  const [guardando, setGuardando] = useState(false);

  const actasLocales = useLiveQuery(() => db.actas.orderBy('digitadaEn').reverse().limit(10).toArray(), []);

  async function descargarCatalogo() {
    setDescargando(true);
    setErrorCatalogo(null);
    try {
      const data = await apiFetch<CatalogoDTO>('/api/catalogo');
      await setCatalogoCache(data);
      setCatalogo(data);
      setMensaje({ tipo: 'exito', texto: `Catálogo actualizado: ${data.mesas.length} mesas.` });
    } catch (e) {
      setErrorCatalogo(e instanceof ApiError ? e.message : 'No se pudo descargar el catálogo (¿sin conexión?)');
    } finally {
      setDescargando(false);
    }
  }

  useEffect(() => {
    (async () => {
      const cache = await getCatalogoCache();
      if (cache) setCatalogo(cache);
      if (!cache && navigator.onLine) await descargarCatalogo();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mesasFiltradas = useMemo(() => {
    if (!catalogo || busqueda.trim().length < 2) return [];
    const actasPorMesa = new Set((actasLocales ?? []).map((a) => a.mesaId));
    return catalogo.mesas
      .filter((m) => m.codigo.includes(busqueda.trim()))
      .slice(0, 15)
      .map((m) => ({ ...m, yaDigitada: actasPorMesa.has(m.id) }));
  }, [catalogo, busqueda, actasLocales]);

  const cedula = useMemo(() => {
    if (!catalogo || !mesaSeleccionada) return null;
    return construirCedulaMesa(mesaSeleccionada, catalogo.listas);
  }, [catalogo, mesaSeleccionada]);

  function seleccionarMesa(mesa: MesaCatalogoItem) {
    setMesaSeleccionada(mesa);
    setBusqueda('');
    setMensaje(null);
    const c = catalogo ? construirCedulaMesa(mesa, catalogo.listas) : null;
    setConteo(c ? columnaVacia(c.columnas) : {});
  }

  function actualizarVoto(cargo: string, listaId: string, valor: string) {
    const n = Math.max(0, parseInt(valor, 10) || 0);
    setConteo((prev) => ({ ...prev, [cargo]: { ...prev[cargo], votos: { ...prev[cargo].votos, [listaId]: n } } }));
  }

  function actualizarEspecial(cargo: string, campo: 'blanco' | 'nulo' | 'impugnado', valor: string) {
    const n = Math.max(0, parseInt(valor, 10) || 0);
    setConteo((prev) => ({ ...prev, [cargo]: { ...prev[cargo], [campo]: n } }));
  }

  function totalColumna(cargo: string): number {
    const c = conteo[cargo];
    if (!c) return 0;
    return Object.values(c.votos).reduce((a, b) => a + b, 0) + c.blanco + c.nulo + c.impugnado;
  }

  async function guardarActa() {
    if (!cedula || !mesaSeleccionada) return;
    setGuardando(true);
    setMensaje(null);
    try {
      const resultados: ResultadoInput[] = [];
      for (const col of cedula.columnas) {
        const c = conteo[col.cargo];
        for (const lista of col.listas) {
          resultados.push({ cargo: col.cargo, listaCandidaturaId: lista.id, tipo: 'VOTO_LISTA', votos: c?.votos[lista.id] ?? 0 });
        }
        resultados.push({ cargo: col.cargo, listaCandidaturaId: null, tipo: 'BLANCO', votos: c?.blanco ?? 0 });
        resultados.push({ cargo: col.cargo, listaCandidaturaId: null, tipo: 'NULO', votos: c?.nulo ?? 0 });
        resultados.push({ cargo: col.cargo, listaCandidaturaId: null, tipo: 'IMPUGNADO', votos: c?.impugnado ?? 0 });
      }

      const clienteId = crypto.randomUUID();
      await db.actas.add({
        clienteId,
        mesaId: mesaSeleccionada.id,
        mesaCodigo: mesaSeleccionada.codigo,
        resultados,
        digitadaEn: new Date().toISOString(),
        estado: 'pendiente',
      });

      setMensaje({ tipo: 'info', texto: 'Acta guardada en el dispositivo. Sincronizando...' });
      setMesaSeleccionada(null);
      setConteo({});

      if (navigator.onLine) {
        const r = await sincronizarPendientes();
        setMensaje({ tipo: 'exito', texto: `Acta guardada. Sincronizadas: ${r.enviadas}${r.fallidas ? `, con error: ${r.fallidas}` : ''}.` });
      } else {
        setMensaje({ tipo: 'info', texto: 'Acta guardada localmente. Se sincronizará automáticamente al recuperar conexión.' });
      }
    } catch (e) {
      setMensaje({ tipo: 'error', texto: 'No se pudo guardar el acta: ' + (e instanceof Error ? e.message : String(e)) });
    } finally {
      setGuardando(false);
    }
  }

  if (!catalogo) {
    return (
      <div className="card">
        <h3>Catálogo no disponible</h3>
        <p style={{ fontSize: 13 }}>
          Necesitas descargar el catálogo de mesas y candidatos al menos una vez con conexión a internet.
        </p>
        {errorCatalogo && <div className="mensaje error">{errorCatalogo}</div>}
        <button onClick={descargarCatalogo} disabled={descargando}>
          {descargando ? 'Descargando...' : 'Descargar catálogo'}
        </button>
      </div>
    );
  }

  return (
    <div>
      {mensaje && <div className={`mensaje ${mensaje.tipo}`}>{mensaje.texto}</div>}

      {!mesaSeleccionada && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0 }}>Buscar mesa de sufragio</h3>
            <button className="secundario" style={{ width: 'auto' }} onClick={descargarCatalogo} disabled={descargando}>
              {descargando ? '...' : 'Actualizar catálogo'}
            </button>
          </div>
          <div className="form-row" style={{ marginTop: 12 }}>
            <label htmlFor="codigo">Código de mesa</label>
            <input
              id="codigo"
              placeholder="Ej. 004028"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              autoFocus
            />
          </div>
          <ul className="lista-mesas">
            {mesasFiltradas.map((m) => (
              <li key={m.id} onClick={() => seleccionarMesa(m)}>
                <div>
                  <strong>{m.codigo}</strong> — {m.localVotacion}
                  <div style={{ fontSize: 12, color: '#666' }}>
                    {m.distrito}, {m.provincia} · {m.electores} electores
                  </div>
                </div>
                <span className={`tag ${m.yaDigitada ? 'digitada' : 'pendiente'}`}>
                  {m.yaDigitada ? 'Ya digitada' : 'Pendiente'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {cedula && mesaSeleccionada && (
        <div className="card">
          <button className="secundario" style={{ width: 'auto', marginBottom: 12 }} onClick={() => setMesaSeleccionada(null)}>
            ← Cambiar de mesa
          </button>
          <h3 style={{ marginTop: 0 }}>
            Mesa {cedula.mesaCodigo} — {cedula.localVotacion}
          </h3>
          <p style={{ fontSize: 13, color: '#555' }}>
            {cedula.distrito}, {cedula.provincia} · Electores hábiles: {cedula.electoresHabiles}
          </p>

          {cedula.columnas.map((col) => (
            <div key={col.cargo} className="columna-cedula">
              <h3>{col.titulo}</h3>
              {col.listas.map((lista) => (
                <div className="lista-row" key={lista.id}>
                  {lista.simboloUrl && (
                    <img src={lista.simboloUrl} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} />
                  )}
                  <span className="nombre">{lista.organizacion}</span>
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={conteo[col.cargo]?.votos[lista.id] ?? 0}
                    onChange={(e) => actualizarVoto(col.cargo, lista.id, e.target.value)}
                  />
                </div>
              ))}
              <div className="lista-row">
                <span className="nombre">Votos en blanco</span>
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={conteo[col.cargo]?.blanco ?? 0}
                  onChange={(e) => actualizarEspecial(col.cargo, 'blanco', e.target.value)}
                />
              </div>
              <div className="lista-row">
                <span className="nombre">Votos nulos</span>
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={conteo[col.cargo]?.nulo ?? 0}
                  onChange={(e) => actualizarEspecial(col.cargo, 'nulo', e.target.value)}
                />
              </div>
              <div className="lista-row">
                <span className="nombre">Votos impugnados</span>
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={conteo[col.cargo]?.impugnado ?? 0}
                  onChange={(e) => actualizarEspecial(col.cargo, 'impugnado', e.target.value)}
                />
              </div>
              <div style={{ padding: '8px 12px', fontSize: 12, color: '#555' }}>
                Total: {totalColumna(col.cargo)} / {cedula.electoresHabiles} electores hábiles
              </div>
            </div>
          ))}

          <button onClick={guardarActa} disabled={guardando}>
            {guardando ? 'Guardando...' : 'Guardar acta'}
          </button>
        </div>
      )}

      {!mesaSeleccionada && actasLocales && actasLocales.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Últimas actas digitadas en este dispositivo</h3>
          <table className="resumen">
            <thead>
              <tr>
                <th>Mesa</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {actasLocales.map((a) => (
                <tr key={a.clienteId}>
                  <td>{a.mesaCodigo}</td>
                  <td>{a.estado === 'sincronizada' ? 'Sincronizada' : a.estado === 'error' ? `Error: ${a.ultimoError}` : 'Pendiente de sincronizar'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

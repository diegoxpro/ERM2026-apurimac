import { useEffect, useMemo, useState } from 'react';
import type { CatalogoDTO, CedulaMesaDTO, ColumnaCedulaDTO, ResultadoInput } from '@erm2026/shared';
import { construirCedulaMesa } from '@erm2026/shared';
import { apiFetch, ApiError } from '../lib/api';
import { db, getCatalogoCache, setCatalogoCache } from '../lib/db';
import { sincronizarPendientes } from '../lib/sync';

interface MesaFila {
  id: string;
  codigo: string;
  localVotacion: string;
  distrito: string;
  provincia: string;
  electores: number;
  personeroNombre: string | null;
  actasRegistradas: number;
  actasEsperadas: number;
}

const ESTADO_LABEL: Record<string, string> = {
  SIN_REGISTRAR: 'Sin registrar',
  ENVIADA: 'Enviada',
  VALIDADA: 'Validada',
  OBSERVADA: 'Observada',
};

export default function LlenarActas() {
  const [catalogo, setCatalogo] = useState<CatalogoDTO | null>(null);
  const [descargando, setDescargando] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [mesasOnline, setMesasOnline] = useState<MesaFila[] | null>(null);
  const [mesaSeleccionada, setMesaSeleccionada] = useState<MesaFila | null>(null);
  const [cedula, setCedula] = useState<CedulaMesaDTO | null>(null);
  const [cargandoCedula, setCargandoCedula] = useState(false);
  const [columnaActiva, setColumnaActiva] = useState<ColumnaCedulaDTO | null>(null);
  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error' | 'info'; texto: string } | null>(null);

  useEffect(() => {
    (async () => {
      const cache = await getCatalogoCache();
      if (cache) setCatalogo(cache);
      if (!cache && navigator.onLine) await descargarCatalogo();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function descargarCatalogo() {
    setDescargando(true);
    try {
      const data = await apiFetch<CatalogoDTO>('/api/catalogo');
      await setCatalogoCache(data);
      setCatalogo(data);
    } catch {
      // Silencioso: si falla, seguimos con lo que haya en caché (u offline).
    } finally {
      setDescargando(false);
    }
  }

  // Búsqueda: si hay conexión, se usa el endpoint (trae personero y avance en
  // vivo); si no, se cae al catálogo cacheado localmente.
  useEffect(() => {
    if (busqueda.trim().length < 2) {
      setMesasOnline(null);
      return;
    }
    if (!navigator.onLine) {
      setMesasOnline(null);
      return;
    }
    const controlador = new AbortController();
    const t = setTimeout(async () => {
      try {
        const data = await apiFetch<{ items: MesaFila[] }>(`/api/mesas?search=${encodeURIComponent(busqueda.trim())}&limit=20`);
        setMesasOnline(data.items);
      } catch {
        setMesasOnline(null);
      }
    }, 250);
    return () => {
      clearTimeout(t);
      controlador.abort();
    };
  }, [busqueda]);

  const mesasOffline: MesaFila[] = useMemo(() => {
    if (!catalogo || busqueda.trim().length < 2) return [];
    return catalogo.mesas
      .filter((m) => m.codigo.includes(busqueda.trim()))
      .slice(0, 20)
      .map((m) => ({
        id: m.id,
        codigo: m.codigo,
        localVotacion: m.localVotacion,
        distrito: m.distrito,
        provincia: m.provincia,
        electores: m.electores,
        personeroNombre: null,
        actasRegistradas: 0,
        actasEsperadas: m.capitalDeProvincia ? 3 : 4,
      }));
  }, [catalogo, busqueda]);

  const filas = mesasOnline ?? mesasOffline;

  async function abrirMesa(mesa: MesaFila) {
    setMesaSeleccionada(mesa);
    setBusqueda('');
    setMensaje(null);
    setCargandoCedula(true);
    try {
      if (navigator.onLine) {
        const data = await apiFetch<CedulaMesaDTO>(`/api/mesas/${mesa.id}/cedula`);
        setCedula(await conEstadoLocal(data));
      } else if (catalogo) {
        const mesaCat = catalogo.mesas.find((m) => m.id === mesa.id);
        if (mesaCat) setCedula(await conEstadoLocal(construirCedulaMesa(mesaCat, catalogo.listas)));
      }
    } catch (e) {
      setMensaje({ tipo: 'error', texto: e instanceof ApiError ? e.message : 'No se pudo cargar la cédula de esta mesa' });
    } finally {
      setCargandoCedula(false);
    }
  }

  // Superpone el estado de actas guardadas localmente (aún no sincronizadas)
  // sobre la cédula, para que el personero vea "Enviada" aunque esté offline.
  async function conEstadoLocal(base: CedulaMesaDTO): Promise<CedulaMesaDTO> {
    const locales = await db.actas.where('mesaId').equals(base.mesaId).toArray();
    if (locales.length === 0) return base;
    const porCargo = new Map(locales.map((a) => [a.cargo, a]));
    return {
      ...base,
      columnas: base.columnas.map((col) => {
        const local = porCargo.get(col.cargo);
        if (!local || col.estado !== 'SIN_REGISTRAR') return col;
        return { ...col, estado: local.estado === 'error' ? 'SIN_REGISTRAR' : 'ENVIADA' };
      }),
    };
  }

  function cerrarMesa() {
    setMesaSeleccionada(null);
    setCedula(null);
    setColumnaActiva(null);
  }

  async function alGuardar() {
    if (!mesaSeleccionada) return;
    setMensaje({ tipo: 'info', texto: 'Acta guardada. Sincronizando...' });
    setColumnaActiva(null);
    // Recargar el estado del modal de cargos para reflejar el guardado.
    await abrirMesa(mesaSeleccionada);
    if (navigator.onLine) {
      const r = await sincronizarPendientes();
      setMensaje({ tipo: 'exito', texto: `Acta guardada y sincronizada (${r.enviadas}).` });
    } else {
      setMensaje({ tipo: 'info', texto: 'Acta guardada en el dispositivo. Se sincronizará al recuperar conexión.' });
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Llenar actas</h2>
          <p>Registra el conteo final de votos de una mesa.</p>
        </div>
        <div className="filtros">
          <button className="btn secundario" onClick={descargarCatalogo} disabled={descargando}>
            {descargando ? 'Actualizando…' : 'Actualizar catálogo offline'}
          </button>
        </div>
      </div>

      {mensaje && <div className={`mensaje ${mensaje.tipo}`}>{mensaje.texto}</div>}

      <div className="card">
        <div className="toolbar">
          <div className="buscador">
            <input
              placeholder="Buscar por número de mesa o local"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              autoFocus
            />
          </div>
        </div>

        {busqueda.trim().length >= 2 && filas.length === 0 && <div className="vacio">Sin resultados para "{busqueda}"</div>}

        {filas.length > 0 && (
          <table className="tabla">
            <thead>
              <tr>
                <th>Mesa</th>
                <th>Local / Distrito</th>
                <th>Personero</th>
                <th>Electores</th>
                <th>Avance</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filas.map((m) => (
                <tr key={m.id}>
                  <td>
                    <strong>{m.codigo}</strong>
                  </td>
                  <td>
                    {m.localVotacion}
                    <div className="subtexto">
                      {m.distrito}, {m.provincia}
                    </div>
                  </td>
                  <td>{m.personeroNombre ?? '—'}</td>
                  <td>{m.electores}</td>
                  <td>
                    {m.actasRegistradas} de {m.actasEsperadas} actas
                  </td>
                  <td>
                    <button className="btn pequeno" onClick={() => abrirMesa(m)}>
                      Llenar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {busqueda.trim().length < 2 && (
          <div className="vacio">Escribe al menos 2 caracteres para buscar una mesa.</div>
        )}
      </div>

      {mesaSeleccionada && cedula && !columnaActiva && (
        <div className="modal-fondo" onClick={cerrarMesa}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>Mesa {cedula.mesaCodigo}</h3>
                <p>
                  {cedula.localVotacion} · {cedula.distrito}
                </p>
              </div>
              <button onClick={cerrarMesa}>×</button>
            </div>
            <p style={{ fontSize: 13, color: '#6b7280', marginTop: -8, marginBottom: 14 }}>
              {cedula.electoresHabiles} electores hábiles. Elige el cargo para registrar sus votos.
            </p>
            {cargandoCedula && <p>Cargando…</p>}
            {cedula.columnas.map((col) => (
              <div key={col.cargo} className={`cargo-card estado-${col.estado}`}>
                <div>
                  <div className="titulo">{tituloCorto(col.cargo)}</div>
                  <div className="subtitulo">{col.titulo}</div>
                  <div className="subtitulo">{ESTADO_LABEL[col.estado]}</div>
                </div>
                <button className="accion" onClick={() => setColumnaActiva(col)}>
                  {col.estado === 'SIN_REGISTRAR' ? 'Llenar' : 'Ver / editar'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {mesaSeleccionada && cedula && columnaActiva && (
        <FormularioCargo
          mesa={mesaSeleccionada}
          cedula={cedula}
          columna={columnaActiva}
          onCancelar={() => setColumnaActiva(null)}
          onGuardado={alGuardar}
        />
      )}
    </div>
  );
}

function tituloCorto(cargo: string): string {
  switch (cargo) {
    case 'GOBERNADOR_REGIONAL':
      return 'Gobernador regional';
    case 'CONSEJERO_REGIONAL':
      return 'Consejero regional';
    case 'ALCALDE_PROVINCIAL':
      return 'Alcalde provincial';
    case 'ALCALDE_DISTRITAL':
      return 'Alcalde distrital';
    default:
      return cargo;
  }
}

function FormularioCargo({
  mesa,
  cedula,
  columna,
  onCancelar,
  onGuardado,
}: {
  mesa: MesaFila;
  cedula: CedulaMesaDTO;
  columna: ColumnaCedulaDTO;
  onCancelar: () => void;
  onGuardado: () => void;
}) {
  const [votos, setVotos] = useState<Record<string, number>>({});
  const [blanco, setBlanco] = useState(0);
  const [nulo, setNulo] = useState(0);
  const [impugnado, setImpugnado] = useState(0);
  const [guardando, setGuardando] = useState(false);
  const soloLectura = columna.estado === 'VALIDADA';

  const validos = Object.values(votos).reduce((a, b) => a + b, 0);
  const totalEmitidos = validos + blanco + nulo + impugnado;

  function cambiar(listaId: string, delta: number) {
    setVotos((prev) => ({ ...prev, [listaId]: Math.max(0, (prev[listaId] ?? 0) + delta) }));
  }

  function fijar(listaId: string, valor: string) {
    const n = Math.max(0, parseInt(valor, 10) || 0);
    setVotos((prev) => ({ ...prev, [listaId]: n }));
  }

  async function guardar() {
    setGuardando(true);
    try {
      const resultados: ResultadoInput[] = [
        ...columna.listas.map((l) => ({ listaCandidaturaId: l.id, tipo: 'VOTO_LISTA' as const, votos: votos[l.id] ?? 0 })),
        { listaCandidaturaId: null, tipo: 'BLANCO' as const, votos: blanco },
        { listaCandidaturaId: null, tipo: 'NULO' as const, votos: nulo },
        { listaCandidaturaId: null, tipo: 'IMPUGNADO' as const, votos: impugnado },
      ];
      const clienteId = crypto.randomUUID();
      await db.actas.add({
        clienteId,
        mesaId: mesa.id,
        mesaCodigo: mesa.codigo,
        cargo: columna.cargo,
        resultados,
        digitadaEn: new Date().toISOString(),
        estado: 'pendiente',
      });
      onGuardado();
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="modal-fondo" onClick={onCancelar}>
      <div className="modal ancho" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>Mesa {cedula.mesaCodigo}</h3>
            <p>
              {cedula.localVotacion} · {cedula.distrito}
            </p>
          </div>
          <button onClick={onCancelar}>×</button>
        </div>

        <div className="cargo-card estado-SIN_REGISTRAR" style={{ marginBottom: 16 }}>
          <div>
            <div className="titulo">{tituloCorto(columna.cargo)}</div>
            <div className="subtitulo">{columna.titulo}</div>
          </div>
        </div>

        {columna.listas.map((lista) => (
          <div key={lista.id} className="stepper-row">
            {lista.simboloUrl && <img src={lista.simboloUrl} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} />}
            <span className="nombre">{lista.organizacion}</span>
            <div className="stepper">
              <button type="button" onClick={() => cambiar(lista.id, -1)} disabled={soloLectura}>
                −
              </button>
              <input
                type="number"
                min={0}
                inputMode="numeric"
                value={votos[lista.id] ?? 0}
                onChange={(e) => fijar(lista.id, e.target.value)}
                disabled={soloLectura}
              />
              <button type="button" onClick={() => cambiar(lista.id, 1)} disabled={soloLectura}>
                +
              </button>
            </div>
          </div>
        ))}

        <div className="especiales-grid">
          <div>
            <label>Blancos</label>
            <input type="number" min={0} value={blanco} onChange={(e) => setBlanco(Math.max(0, parseInt(e.target.value, 10) || 0))} disabled={soloLectura} />
          </div>
          <div>
            <label>Nulos</label>
            <input type="number" min={0} value={nulo} onChange={(e) => setNulo(Math.max(0, parseInt(e.target.value, 10) || 0))} disabled={soloLectura} />
          </div>
          <div>
            <label>Impugnados</label>
            <input type="number" min={0} value={impugnado} onChange={(e) => setImpugnado(Math.max(0, parseInt(e.target.value, 10) || 0))} disabled={soloLectura} />
          </div>
        </div>

        <div className="resumen-modal">
          <div>
            <span className="valor">{validos}</span>
            Válidos
          </div>
          <div style={{ textAlign: 'right' }}>
            <span className="valor">
              {totalEmitidos} de {cedula.electoresHabiles}
            </span>
            Total emitidos
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn secundario" onClick={onCancelar}>
            Cancelar
          </button>
          {!soloLectura && (
            <button className="btn" onClick={guardar} disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar acta'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

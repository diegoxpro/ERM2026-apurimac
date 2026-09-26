import { useEffect, useState } from 'react';
import type { ActaResumenDTO, Cargo, DetalleActaDTO, EstadoActa } from '@erm2026/shared';
import { apiFetch, ApiError } from '../lib/api';
import { IconCamera, IconClose } from '../components/Icons';

const CARGO_LABEL: Record<Cargo, string> = {
  GOBERNADOR_REGIONAL: 'Gobernador Regional',
  CONSEJERO_REGIONAL: 'Consejero Regional',
  ALCALDE_PROVINCIAL: 'Alcalde Provincial',
  ALCALDE_DISTRITAL: 'Alcalde Distrital',
};

const ESTADO_LABEL: Record<EstadoActa, string> = {
  ENVIADA: 'Enviada',
  VALIDADA: 'Validada',
  OBSERVADA: 'Observada',
};

export default function ActasRecibidas() {
  const [actas, setActas] = useState<ActaResumenDTO[] | null>(null);
  const [total, setTotal] = useState(0);
  const [busqueda, setBusqueda] = useState('');
  const [cargo, setCargo] = useState('');
  const [estado, setEstado] = useState('');
  const [pagina, setPagina] = useState(0);
  const [actaDetalle, setActaDetalle] = useState<ActaResumenDTO | null>(null);
  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null);
  const LIMITE = 30;

  async function cargar() {
    const params = new URLSearchParams({ limit: String(LIMITE), offset: String(pagina * LIMITE) });
    if (busqueda) params.set('search', busqueda);
    if (cargo) params.set('cargo', cargo);
    if (estado) params.set('estado', estado);
    try {
      const data = await apiFetch<{ total: number; items: ActaResumenDTO[] }>(`/api/actas?${params.toString()}`);
      setActas(data.items);
      setTotal(data.total);
    } catch (e) {
      setMensaje({ tipo: 'error', texto: e instanceof ApiError ? e.message : 'No se pudo cargar la lista de actas' });
    }
  }

  useEffect(() => {
    const t = setTimeout(cargar, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda, cargo, estado, pagina]);

  useEffect(() => {
    setPagina(0);
  }, [busqueda, cargo, estado]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Actas recibidas</h2>
          <p>Actas que ya enviaron los personeros, por mesa y por cargo.</p>
        </div>
      </div>

      {mensaje && <div className={`mensaje ${mensaje.tipo}`}>{mensaje.texto}</div>}

      <div className="card">
        <div className="toolbar">
          <div className="buscador">
            <input placeholder="Buscar por número de mesa" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
          </div>
          <select value={cargo} onChange={(e) => setCargo(e.target.value)}>
            <option value="">Todos los cargos</option>
            {(Object.keys(CARGO_LABEL) as Cargo[]).map((c) => (
              <option key={c} value={c}>
                {CARGO_LABEL[c]}
              </option>
            ))}
          </select>
          <select value={estado} onChange={(e) => setEstado(e.target.value)}>
            <option value="">Todos los estados</option>
            <option value="ENVIADA">Enviada</option>
            <option value="VALIDADA">Validada</option>
            <option value="OBSERVADA">Observada</option>
          </select>
        </div>

        {actas && actas.length === 0 && <div className="vacio">No se encontraron actas con esos filtros.</div>}

        {actas && actas.length > 0 && (
          <>
            <table className="tabla">
              <thead>
                <tr>
                  <th>Mesa</th>
                  <th>Cargo</th>
                  <th>Lugar de votación</th>
                  <th>Personero</th>
                  <th>Foto</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {actas.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <strong>{a.mesaCodigo}</strong>
                    </td>
                    <td>{CARGO_LABEL[a.cargo]}</td>
                    <td>
                      {a.localVotacion}
                      <div className="subtexto">
                        {a.distrito}, {a.provincia}
                      </div>
                    </td>
                    <td>{a.personeroNombre}</td>
                    <td>
                      {a.tieneFoto ? (
                        <span className="icono-foto-si" title="Tiene foto del acta">
                          <IconCamera />
                        </span>
                      ) : (
                        <span className="subtexto">—</span>
                      )}
                    </td>
                    <td>
                      <span className={`badge-estado ${a.estado}`}>{ESTADO_LABEL[a.estado]}</span>
                    </td>
                    <td>
                      <button className="btn pequeno secundario" onClick={() => setActaDetalle(a)}>
                        Detalles
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="paginacion">
              <span className="subtexto">
                {pagina * LIMITE + 1}–{Math.min((pagina + 1) * LIMITE, total)} de {total}
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn pequeno secundario" disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)}>
                  Anterior
                </button>
                <button
                  className="btn pequeno secundario"
                  disabled={(pagina + 1) * LIMITE >= total}
                  onClick={() => setPagina((p) => p + 1)}
                >
                  Siguiente
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {actaDetalle && (
        <ModalDetalleActa
          resumen={actaDetalle}
          onCerrar={() => setActaDetalle(null)}
          onValidada={() => {
            setActaDetalle(null);
            cargar();
          }}
        />
      )}
    </div>
  );
}

function ModalDetalleActa({
  resumen,
  onCerrar,
  onValidada,
}: {
  resumen: ActaResumenDTO;
  onCerrar: () => void;
  onValidada: () => void;
}) {
  const [detalle, setDetalle] = useState<DetalleActaDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [validando, setValidando] = useState(false);

  useEffect(() => {
    apiFetch<DetalleActaDTO>(`/api/mesas/${resumen.mesaId}/actas/${resumen.cargo}`)
      .then(setDetalle)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'No se pudo cargar el detalle del acta'));
  }, [resumen.mesaId, resumen.cargo]);

  const votosLista = (detalle?.resultados ?? []).filter((r) => r.tipo === 'VOTO_LISTA');
  const especiales = {
    blanco: detalle?.resultados.find((r) => r.tipo === 'BLANCO')?.votos ?? 0,
    nulo: detalle?.resultados.find((r) => r.tipo === 'NULO')?.votos ?? 0,
    impugnado: detalle?.resultados.find((r) => r.tipo === 'IMPUGNADO')?.votos ?? 0,
  };
  const validos = votosLista.reduce((a, r) => a + r.votos, 0);
  const totalEmitidos = validos + especiales.blanco + especiales.nulo + especiales.impugnado;

  async function validar() {
    if (!detalle) return;
    setValidando(true);
    try {
      await apiFetch(`/api/actas/${detalle.id}/validar`, { method: 'POST' });
      onValidada();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo validar el acta');
    } finally {
      setValidando(false);
    }
  }

  return (
    <div className="modal-fondo" onClick={onCerrar}>
      <div className="modal ancho" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>Mesa {resumen.mesaCodigo}</h3>
            <p>{CARGO_LABEL[resumen.cargo]}</p>
          </div>
          <button onClick={onCerrar}>
            <IconClose />
          </button>
        </div>

        {error && <div className="mensaje error">{error}</div>}

        <span className={`badge-estado ${resumen.estado}`} style={{ marginBottom: 14, display: 'inline-block' }}>
          {ESTADO_LABEL[resumen.estado]}
        </span>

        <div className="grid-detalle-acta">
          <div>
            <span className="etiqueta">Local</span>
            <span className="valor" title={resumen.localVotacion}>
              {resumen.localVotacion}
            </span>
          </div>
          <div>
            <span className="etiqueta">Distrito</span>
            <span className="valor">{resumen.distrito}</span>
          </div>
          <div>
            <span className="etiqueta">Personero</span>
            <span className="valor">{resumen.personeroNombre}</span>
          </div>
          <div>
            <span className="etiqueta">Registrada</span>
            <span className="valor">
              {detalle ? new Date(detalle.digitadaEn).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' }) : '…'}
            </span>
          </div>
        </div>

        {!detalle && !error && <p className="subtexto" style={{ textAlign: 'center', padding: 20 }}>Cargando…</p>}

        {detalle && (
          <>
            <table className="tabla tabla-votos">
              <thead>
                <tr>
                  <th>Organización</th>
                  <th style={{ textAlign: 'right' }}>Votos</th>
                </tr>
              </thead>
              <tbody>
                {votosLista.map((r, i) => (
                  <tr key={r.listaCandidaturaId ?? i}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {r.simboloUrl && (
                          <img
                            src={r.simboloUrl}
                            alt=""
                            style={{ width: 22, height: 22, borderRadius: 5, objectFit: 'contain', background: '#f4f6f5' }}
                            onError={(e) => (e.currentTarget.style.display = 'none')}
                          />
                        )}
                        {r.organizacion}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right' }}>{r.votos}</td>
                  </tr>
                ))}
                <tr>
                  <td>En blanco</td>
                  <td style={{ textAlign: 'right' }}>{especiales.blanco}</td>
                </tr>
                <tr>
                  <td>Nulos</td>
                  <td style={{ textAlign: 'right' }}>{especiales.nulo}</td>
                </tr>
                <tr>
                  <td>Impugnados</td>
                  <td style={{ textAlign: 'right' }}>{especiales.impugnado}</td>
                </tr>
                <tr className="fila-total-acta">
                  <td>
                    <strong>Total</strong>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <strong>
                      {totalEmitidos} de {resumen.electoresHabiles} hábiles
                    </strong>
                  </td>
                </tr>
              </tbody>
            </table>

            {detalle.observaciones && (
              <div className="mensaje info" style={{ marginTop: 12 }}>
                <strong>Observaciones:</strong> {detalle.observaciones}
              </div>
            )}

            {detalle.fotoBase64 && (
              <div style={{ marginTop: 14 }}>
                <span className="etiqueta" style={{ display: 'block', marginBottom: 6 }}>
                  Foto del acta física
                </span>
                <img src={detalle.fotoBase64} alt="Foto del acta" style={{ width: '100%', maxHeight: 320, objectFit: 'contain', borderRadius: 8, border: '1px solid var(--color-borde)' }} />
              </div>
            )}
          </>
        )}

        <div className="modal-footer">
          <button className="btn secundario" onClick={onCerrar}>
            Cerrar
          </button>
          {detalle && detalle.estado === 'ENVIADA' && (
            <button className="btn" onClick={validar} disabled={validando}>
              {validando ? 'Validando…' : 'Marcar como validada'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

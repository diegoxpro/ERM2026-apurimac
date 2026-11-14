import { useEffect, useMemo, useRef, useState } from 'react';
import type { ActaSyncInput, ActaSyncResult, CedulaMesaDTO, ColumnaCedulaDTO, ResultadoInput, UsuarioDTO } from '@erm2026/shared';
import { ELECCION } from '@erm2026/shared';
import { apiFetch, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { comprimirImagen } from '../lib/imagen';
import { IconCamera, IconClose } from '../components/Icons';
import { ModalDetalleActa } from './ActasRecibidas';

interface MesaFila {
  id: string;
  codigo: string;
  localVotacion: string;
  distrito: string;
  provincia: string;
  electores: number;
  personeroId: string | null;
  personeroNombre: string | null;
  actasRegistradas: number;
  actasEsperadas: number;
}

interface GeoProvincia {
  nombre: string;
  distritos: { nombre: string; capitalDeProvincia: boolean }[];
}

const ESTADO_LABEL: Record<string, string> = {
  SIN_REGISTRAR: 'Sin registrar',
  ENVIADA: 'Enviada',
  VALIDADA: 'Validada',
  OBSERVADA: 'Observada',
};

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

export default function LlenarActas() {
  const [busqueda, setBusqueda] = useState('');
  const [geo, setGeo] = useState<GeoProvincia[]>([]);
  const [provinciaFiltro, setProvinciaFiltro] = useState('');
  const [distritoFiltro, setDistritoFiltro] = useState('');
  const [mesas, setMesas] = useState<MesaFila[] | null>(null);
  const [personeros, setPersoneros] = useState<UsuarioDTO[]>([]);
  const [mesaSeleccionada, setMesaSeleccionada] = useState<MesaFila | null>(null);
  const [cedula, setCedula] = useState<CedulaMesaDTO | null>(null);
  const [columnaActiva, setColumnaActiva] = useState<ColumnaCedulaDTO | null>(null);
  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null);

  useEffect(() => {
    apiFetch<GeoProvincia[]>('/api/locales/geo').then(setGeo).catch(() => {});
    apiFetch<UsuarioDTO[]>('/api/usuarios?rol=PERSONERO&estado=activo').then(setPersoneros).catch(() => {});
  }, []);

  const distritosDisponibles = geo.find((p) => p.nombre === provinciaFiltro)?.distritos ?? [];
  const hayFiltro = busqueda.trim().length >= 2 || provinciaFiltro !== '' || distritoFiltro !== '';

  async function buscarMesas() {
    if (!hayFiltro) {
      setMesas(null);
      return;
    }
    const params = new URLSearchParams({ limit: '100' });
    if (busqueda.trim().length >= 2) params.set('search', busqueda.trim());
    if (provinciaFiltro) params.set('provincia', provinciaFiltro);
    if (distritoFiltro) params.set('distrito', distritoFiltro);
    try {
      const data = await apiFetch<{ items: MesaFila[] }>(`/api/mesas?${params.toString()}`);
      setMesas(data.items);
    } catch (e) {
      setMensaje({ tipo: 'error', texto: e instanceof ApiError ? e.message : 'No se pudo buscar mesas' });
    }
  }

  useEffect(() => {
    const t = setTimeout(buscarMesas, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda, provinciaFiltro, distritoFiltro]);

  async function abrirMesa(mesa: MesaFila) {
    setMesaSeleccionada(mesa);
    setCedula(null);
    try {
      setCedula(await apiFetch<CedulaMesaDTO>(`/api/mesas/${mesa.id}/cedula`));
    } catch (e) {
      setMensaje({ tipo: 'error', texto: e instanceof ApiError ? e.message : 'No se pudo cargar la cédula de esta mesa' });
      setMesaSeleccionada(null);
    }
  }

  function cerrarMesa() {
    setMesaSeleccionada(null);
    setCedula(null);
    setColumnaActiva(null);
  }

  async function alGuardar(texto: string) {
    setColumnaActiva(null);
    setMensaje({ tipo: 'exito', texto });
    if (mesaSeleccionada) await abrirMesa(mesaSeleccionada);
    buscarMesas();
  }

  const columnaYaEnviada = columnaActiva && columnaActiva.estado !== 'SIN_REGISTRAR';

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Llenar actas</h2>
          <p>Registra desde el panel el acta de una mesa (por ejemplo, la que un personero reporta por teléfono o foto).</p>
        </div>
      </div>

      {mensaje && <div className={`mensaje ${mensaje.tipo}`}>{mensaje.texto}</div>}

      <div className="card">
        <div className="toolbar">
          <div className="buscador">
            <input placeholder="Buscar por número de mesa o local" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} autoFocus />
          </div>
          <select value={ELECCION.regionMayus} disabled title="Por ahora solo se cubre esta región">
            <option value={ELECCION.regionMayus}>Región: {ELECCION.region}</option>
          </select>
          <select
            value={provinciaFiltro}
            onChange={(e) => {
              setProvinciaFiltro(e.target.value);
              setDistritoFiltro('');
            }}
          >
            <option value="">Todas las provincias</option>
            {geo.map((p) => (
              <option key={p.nombre} value={p.nombre}>
                {p.nombre}
              </option>
            ))}
          </select>
          <select value={distritoFiltro} onChange={(e) => setDistritoFiltro(e.target.value)} disabled={!provinciaFiltro}>
            <option value="">Todos los distritos</option>
            {distritosDisponibles.map((d) => (
              <option key={d.nombre} value={d.nombre}>
                {d.nombre}
              </option>
            ))}
          </select>
        </div>

        {!hayFiltro && <div className="vacio">Escribe al menos 2 caracteres, o elige una provincia/distrito, para ver mesas.</div>}
        {hayFiltro && mesas && mesas.length === 0 && <div className="vacio">Sin resultados para los filtros elegidos.</div>}

        {hayFiltro && mesas && mesas.length > 0 && (
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
              {mesas.map((m) => (
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
                      {m.actasRegistradas >= m.actasEsperadas ? 'Ver' : 'Llenar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {mesaSeleccionada && !columnaActiva && (
        <div className="modal-fondo" onClick={cerrarMesa}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>Mesa {mesaSeleccionada.codigo}</h3>
                <p>
                  {mesaSeleccionada.localVotacion} · {mesaSeleccionada.distrito}
                </p>
              </div>
              <button onClick={cerrarMesa}>
                <IconClose />
              </button>
            </div>
            {!cedula && <p className="subtexto">Cargando…</p>}
            {cedula &&
              cedula.columnas.map((col) => (
                <div key={col.cargo} className={`cargo-card estado-${col.estado}`}>
                  <div>
                    <div className="titulo">{tituloCorto(col.cargo)}</div>
                    <div className="subtitulo">{col.titulo}</div>
                    <span className={`badge-estado ${col.estado}`} style={{ display: 'inline-block', marginTop: 6 }}>
                      {ESTADO_LABEL[col.estado]}
                    </span>
                  </div>
                  <button className="btn pequeno" onClick={() => setColumnaActiva(col)}>
                    {col.estado === 'SIN_REGISTRAR' ? 'Llenar acta' : 'Ver acta'}
                  </button>
                </div>
              ))}
          </div>
        </div>
      )}

      {mesaSeleccionada && cedula && columnaActiva && columnaYaEnviada && (
        <ModalDetalleActa
          resumen={{
            mesaId: cedula.mesaId,
            mesaCodigo: cedula.mesaCodigo,
            cargo: columnaActiva.cargo,
            localVotacion: cedula.localVotacion,
            distrito: cedula.distrito,
            personeroNombre: mesaSeleccionada.personeroNombre ?? '—',
            estado: columnaActiva.estado as 'ENVIADA',
            electoresHabiles: cedula.electoresHabiles,
          }}
          onCerrar={() => setColumnaActiva(null)}
          onValidada={() => alGuardar('Acta marcada como validada.')}
        />
      )}

      {mesaSeleccionada && cedula && columnaActiva && !columnaYaEnviada && (
        <FormularioActa
          mesa={mesaSeleccionada}
          cedula={cedula}
          columna={columnaActiva}
          personeros={personeros}
          onCancelar={() => setColumnaActiva(null)}
          onGuardado={() => alGuardar(`Acta de ${tituloCorto(columnaActiva.cargo)} de la mesa ${cedula.mesaCodigo} registrada.`)}
        />
      )}
    </div>
  );
}

function FormularioActa({
  mesa,
  cedula,
  columna,
  personeros,
  onCancelar,
  onGuardado,
}: {
  mesa: MesaFila;
  cedula: CedulaMesaDTO;
  columna: ColumnaCedulaDTO;
  personeros: UsuarioDTO[];
  onCancelar: () => void;
  onGuardado: () => void;
}) {
  const { usuario } = useAuth();
  const [votos, setVotos] = useState<Record<string, string>>({});
  const [blanco, setBlanco] = useState('');
  const [nulo, setNulo] = useState('');
  const [impugnado, setImpugnado] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [foto, setFoto] = useState<string | null>(null);
  const [comprimiendo, setComprimiendo] = useState(false);
  const [titularId, setTitularId] = useState(mesa.personeroId ?? '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const numero = (s: string) => Math.max(0, parseInt(s, 10) || 0);
  const soloDigitos = (v: string) => v.replace(/\D/g, '').slice(0, 5);
  const validos = useMemo(() => Object.values(votos).reduce((a, b) => a + numero(b), 0), [votos]);
  const totalEmitidos = validos + numero(blanco) + numero(nulo) + numero(impugnado);
  const excede = totalEmitidos > cedula.electoresHabiles;

  async function elegirFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    setComprimiendo(true);
    try {
      setFoto(await comprimirImagen(archivo));
    } catch {
      setError('No se pudo leer la imagen seleccionada');
    } finally {
      setComprimiendo(false);
    }
  }

  async function guardar() {
    setError(null);
    if (excede && !confirm(`El total emitido (${totalEmitidos}) supera los ${cedula.electoresHabiles} electores hábiles. ¿Registrar de todos modos?`)) {
      return;
    }
    setGuardando(true);
    try {
      const resultados: ResultadoInput[] = [
        ...columna.listas.map((l) => ({ listaCandidaturaId: l.id, tipo: 'VOTO_LISTA' as const, votos: numero(votos[l.id] ?? '') })),
        { listaCandidaturaId: null, tipo: 'BLANCO' as const, votos: numero(blanco) },
        { listaCandidaturaId: null, tipo: 'NULO' as const, votos: numero(nulo) },
        { listaCandidaturaId: null, tipo: 'IMPUGNADO' as const, votos: numero(impugnado) },
      ];
      const input: ActaSyncInput = {
        clienteId: crypto.randomUUID(),
        mesaId: cedula.mesaId,
        cargo: columna.cargo,
        resultados,
        observaciones: observaciones || undefined,
        fotoBase64: foto ?? undefined,
        digitadaEn: new Date().toISOString(),
        personeroId: titularId || undefined,
      };
      await apiFetch<ActaSyncResult>('/api/actas/sync', { method: 'POST', body: JSON.stringify(input) });
      onGuardado();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setError('Este cargo ya tiene un acta registrada para esta mesa.');
      else setError(e instanceof ApiError ? e.message : 'No se pudo registrar el acta (¿sin conexión?)');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="modal-fondo">
      <div className="modal ancho" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>Mesa {cedula.mesaCodigo}</h3>
            <p>
              {cedula.localVotacion} · {cedula.distrito}
            </p>
          </div>
          <button onClick={onCancelar}>
            <IconClose />
          </button>
        </div>

        <div className="banner-cargo-admin">{columna.titulo}</div>

        {error && <div className="mensaje error">{error}</div>}

        <div className="form-row">
          <label>Registrar a nombre de</label>
          <select value={titularId} onChange={(e) => setTitularId(e.target.value)}>
            <option value="">{usuario?.nombre} (yo)</option>
            {personeros.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre} — DNI {p.dni}
                {p.id === mesa.personeroId ? ' (asignado a esta mesa)' : ''}
              </option>
            ))}
          </select>
        </div>

        <table className="tabla tabla-votos">
          <thead>
            <tr>
              <th>Organización</th>
              <th style={{ textAlign: 'right' }}>Votos</th>
            </tr>
          </thead>
          <tbody>
            {columna.listas.map((lista, i) => (
              <tr key={lista.id}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {lista.simboloUrl && (
                      <img src={lista.simboloUrl} alt="" className="simbolo-fila" onError={(e) => (e.currentTarget.style.display = 'none')} />
                    )}
                    {lista.organizacion}
                  </div>
                </td>
                <td style={{ textAlign: 'right' }}>
                  <input
                    className="caja-votos-admin"
                    inputMode="numeric"
                    placeholder="0"
                    autoFocus={i === 0}
                    value={votos[lista.id] ?? ''}
                    onChange={(e) => setVotos((prev) => ({ ...prev, [lista.id]: soloDigitos(e.target.value) }))}
                  />
                </td>
              </tr>
            ))}
            {[
              ['En blanco', blanco, setBlanco],
              ['Nulos', nulo, setNulo],
              ['Impugnados', impugnado, setImpugnado],
            ].map(([etiqueta, valor, set]) => (
              <tr key={etiqueta as string}>
                <td>{etiqueta as string}</td>
                <td style={{ textAlign: 'right' }}>
                  <input
                    className="caja-votos-admin"
                    inputMode="numeric"
                    placeholder="0"
                    value={valor as string}
                    onChange={(e) => (set as (v: string) => void)(soloDigitos(e.target.value))}
                  />
                </td>
              </tr>
            ))}
            <tr className="fila-total-acta">
              <td>
                <strong>Total</strong> <span className="subtexto">({validos} válidos)</span>
              </td>
              <td style={{ textAlign: 'right', color: excede ? 'var(--color-error)' : undefined }}>
                <strong>
                  {totalEmitidos} de {cedula.electoresHabiles} hábiles
                </strong>
              </td>
            </tr>
          </tbody>
        </table>

        <div className="form-grid" style={{ marginTop: 14 }}>
          <div className="form-row">
            <label>Foto del acta física (opcional)</label>
            <button type="button" className="btn secundario" onClick={() => fileRef.current?.click()} disabled={comprimiendo}>
              <IconCamera /> {comprimiendo ? 'Comprimiendo…' : foto ? 'Cambiar foto' : 'Subir foto'}
            </button>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={elegirFoto} />
            {foto && <img src={foto} alt="Foto del acta" className="previa-foto-admin" />}
          </div>
          <div className="form-row">
            <label>Observaciones (opcional)</label>
            <textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} rows={4} className="textarea-admin" />
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn secundario" onClick={onCancelar}>
            Cancelar
          </button>
          <button className="btn" onClick={guardar} disabled={guardando || comprimiendo}>
            {guardando ? 'Registrando…' : 'Registrar acta'}
          </button>
        </div>
      </div>
    </div>
  );
}

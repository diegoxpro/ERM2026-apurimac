import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import type { Cargo, CedulaMesaDTO, ColumnaCedulaDTO, DetalleActaDTO, LecturaActaDTO, ResultadoInput } from '@erm2026/shared';
import { db } from '../lib/db';
import { apiFetch } from '../lib/api';
import { sincronizarPendientes } from '../lib/sync';
import { claveFoto, encolarFoto, leerFoto, SinConexionError } from '../lib/lector';
import { ApiError } from '../lib/api';
import { comprimirImagen } from '../lib/imagen';
import { obtenerCedula, tituloCorto, ESTADO_LABEL } from '../lib/mesas';
import { IconArrowLeft, IconCamera } from '../components/Icons';

export default function CargoFormulario() {
  const { mesaId, cargo } = useParams<{ mesaId: string; cargo: Cargo }>();
  const navigate = useNavigate();
  const [cedula, setCedula] = useState<CedulaMesaDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    obtenerCedula(mesaId!)
      .then(setCedula)
      .catch((e) => setError(e instanceof Error ? e.message : 'No se pudo cargar la cédula'));
  }, [mesaId]);

  if (error) {
    return (
      <div className="pantalla-carga">
        <p>{error}</p>
        <button className="btn secundario" onClick={() => navigate(-1)}>
          Volver
        </button>
      </div>
    );
  }
  if (!cedula) {
    return (
      <div className="pantalla-carga">
        <p>Cargando…</p>
      </div>
    );
  }

  const columna = cedula.columnas.find((c) => c.cargo === cargo);
  if (!columna) {
    return (
      <div className="pantalla-carga">
        <p>Este cargo no aplica para esta mesa.</p>
        <button className="btn secundario" onClick={() => navigate(-1)}>
          Volver
        </button>
      </div>
    );
  }

  // Una vez que el acta ya fue enviada (o validada/observada), no se vuelve a
  // mostrar un formulario en blanco: se muestra lo que realmente se registró.
  if (columna.estado !== 'SIN_REGISTRAR') {
    return <DetalleActa mesaId={mesaId!} mesaCodigo={cedula.mesaCodigo} columna={columna} />;
  }

  return <Formulario mesaId={mesaId!} mesaCodigo={cedula.mesaCodigo} electoresHabiles={cedula.electoresHabiles} columna={columna} />;
}

function DetalleActa({ mesaId, mesaCodigo, columna }: { mesaId: string; mesaCodigo: string; columna: ColumnaCedulaDTO }) {
  const navigate = useNavigate();
  const [detalle, setDetalle] = useState<DetalleActaDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<DetalleActaDTO>(`/api/mesas/${mesaId}/actas/${columna.cargo}`)
      .then(setDetalle)
      .catch(() => setError('No se pudo cargar el detalle de esta acta (sin conexión).'));
  }, [mesaId, columna.cargo]);

  const porLista = new Map((detalle?.resultados ?? []).filter((r) => r.tipo === 'VOTO_LISTA').map((r) => [r.listaCandidaturaId, r.votos]));
  const especiales = {
    blanco: detalle?.resultados.find((r) => r.tipo === 'BLANCO')?.votos ?? 0,
    nulo: detalle?.resultados.find((r) => r.tipo === 'NULO')?.votos ?? 0,
    impugnado: detalle?.resultados.find((r) => r.tipo === 'IMPUGNADO')?.votos ?? 0,
  };
  const validos = [...porLista.values()].reduce((a, b) => a + b, 0);

  return (
    <div className="pantalla-formulario">
      <div className="app-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="icon-btn-top" onClick={() => navigate(-1)}>
            <IconArrowLeft />
          </button>
          <div>
            <h1>{tituloCorto(columna.cargo)}</h1>
            <p>Mesa {mesaCodigo}</p>
          </div>
        </div>
      </div>

      <div className="banner-cargo">{columna.titulo}</div>

      <div className="contenido-formulario">
        <div className={`aviso-estado estado-${columna.estado}`}>Esta acta ya fue enviada: {ESTADO_LABEL[columna.estado]}.</div>

        {error && <div className="mensaje error">{error}</div>}

        {!detalle && !error && <p className="subtexto" style={{ textAlign: 'center', padding: 16 }}>Cargando…</p>}

        {detalle && (
          <>
            {columna.listas.map((lista) => (
              <div key={lista.id} className="fila-organizacion">
                {lista.simboloUrl ? (
                  <img src={lista.simboloUrl} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} />
                ) : (
                  <span className="simbolo-vacio" />
                )}
                <span className="nombre-organizacion">{lista.organizacion}</span>
                <span className="valor-lectura">{porLista.get(lista.id) ?? 0}</span>
              </div>
            ))}

            <div className="etiqueta-seccion">OTROS VOTOS</div>
            <div className="fila-simple">
              <label>En blanco</label>
              <span className="valor-lectura">{especiales.blanco}</span>
            </div>
            <div className="fila-simple">
              <label>Nulos</label>
              <span className="valor-lectura">{especiales.nulo}</span>
            </div>
            <div className="fila-simple">
              <label>Impugnados</label>
              <span className="valor-lectura">{especiales.impugnado}</span>
            </div>

            {detalle.fotoBase64 && <img src={detalle.fotoBase64} alt="Foto del acta" className="previsualizacion-foto" />}
            {detalle.observaciones && (
              <div className="fila-simple" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                <label>Observaciones</label>
                <span>{detalle.observaciones}</span>
              </div>
            )}

            <div className="pie-resumen" style={{ marginTop: 16 }}>
              <div>
                <span className="valor">{validos}</span>
                Válidos
              </div>
              <div style={{ textAlign: 'right' }}>
                <span className="subtexto">Registrada por {detalle.personeroNombre}</span>
                <br />
                <span className="subtexto">{new Date(detalle.digitadaEn).toLocaleString('es-PE')}</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Formulario({
  mesaId,
  mesaCodigo,
  electoresHabiles,
  columna,
}: {
  mesaId: string;
  mesaCodigo: string;
  electoresHabiles: number;
  columna: ColumnaCedulaDTO;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [votos, setVotos] = useState<Record<string, string>>({});
  const [blanco, setBlanco] = useState('');
  const [nulo, setNulo] = useState('');
  const [impugnado, setImpugnado] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [foto, setFoto] = useState<string | null>(null);
  const [comprimiendo, setComprimiendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [totalActa, setTotalActa] = useState('');
  // Lector de actas (IA)
  const [leyendo, setLeyendo] = useState(false);
  const [leidaPorIA, setLeidaPorIA] = useState(false);
  const [avisosIA, setAvisosIA] = useState<string[]>([]);
  const [mensajeIA, setMensajeIA] = useState<{ tipo: 'info' | 'error'; texto: string } | null>(null);
  const [revisado, setRevisado] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const numero = (s: string) => Math.max(0, parseInt(s, 10) || 0);
  const validos = useMemo(() => Object.values(votos).reduce((a, b) => a + numero(b), 0), [votos]);
  const totalEmitidos = validos + numero(blanco) + numero(nulo) + numero(impugnado);
  const noCuadra = (totalActa !== '' && numero(totalActa) !== totalEmitidos) || (electoresHabiles > 0 && totalEmitidos > electoresHabiles);

  const aTexto = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n));

  function aplicarLectura(l: LecturaActaDTO) {
    const nuevos: Record<string, string> = {};
    for (const lista of columna.listas) nuevos[lista.id] = aTexto(l.votosPorLista[lista.id]);
    setVotos(nuevos);
    setBlanco(aTexto(l.blanco));
    setNulo(aTexto(l.nulo));
    setImpugnado(aTexto(l.impugnado));
    setTotalActa(aTexto(l.totalEmitidos));
    setAvisosIA(l.avisos);
    setLeidaPorIA(true);
    setRevisado(false);
    setMensajeIA(null);
  }

  // Al abrir: lectura que llega desde "Leer acta con foto", o una foto que se
  // tomó sin señal y ya se leyó en segundo plano.
  useEffect(() => {
    const estado = location.state as { foto?: string; lectura?: LecturaActaDTO } | null;
    if (estado?.lectura) {
      if (estado.foto) setFoto(estado.foto);
      aplicarLectura(estado.lectura);
      return;
    }
    let activo = true;
    const clave = claveFoto(mesaId, columna.cargo);
    async function revisarCola() {
      const f = await db.fotosPorLeer.get(clave);
      if (!activo || !f) return;
      setFoto((actual) => actual ?? f.fotoDataUrl);
      if (f.estado === 'leida' && f.lectura) {
        aplicarLectura(f.lectura);
        activo = false;
      } else if (f.estado === 'esperando') {
        setMensajeIA({ tipo: 'info', texto: 'La foto está guardada. La IA la leerá cuando vuelva la señal; también puedes digitar a mano.' });
      } else if (f.estado === 'error') {
        setMensajeIA({ tipo: 'error', texto: `${f.error ?? 'No se pudo leer la foto'}. Digita los datos a mano.` });
        activo = false;
      }
    }
    revisarCola();
    const t = setInterval(() => activo && revisarCola(), 5000);
    return () => {
      activo = false;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mesaId, columna.cargo]);

  async function leerConIA(fotoDataUrl: string) {
    setLeyendo(true);
    setMensajeIA(null);
    try {
      aplicarLectura(await leerFoto(fotoDataUrl, mesaId, columna.cargo));
    } catch (e) {
      if (e instanceof SinConexionError) {
        await encolarFoto(mesaId, columna.cargo, fotoDataUrl);
        setMensajeIA({ tipo: 'info', texto: 'Sin señal: la foto quedó guardada y la IA la leerá al volver la conexión. También puedes digitar a mano.' });
      } else {
        setMensajeIA({ tipo: 'error', texto: e instanceof ApiError ? e.message : 'No se pudo leer la foto. Digita los datos a mano.' });
      }
    } finally {
      setLeyendo(false);
    }
  }

  function soloDigitos(valor: string): string {
    return valor.replace(/\D/g, '').slice(0, 5);
  }

  async function elegirFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    setComprimiendo(true);
    let comprimida: string;
    try {
      comprimida = await comprimirImagen(archivo);
      setFoto(comprimida);
    } finally {
      setComprimiendo(false);
      e.target.value = '';
    }
    await leerConIA(comprimida);
  }

  async function guardar() {
    setGuardando(true);
    try {
      const resultados: ResultadoInput[] = [
        ...columna.listas.map((l) => ({ listaCandidaturaId: l.id, tipo: 'VOTO_LISTA' as const, votos: numero(votos[l.id] ?? '') })),
        { listaCandidaturaId: null, tipo: 'BLANCO' as const, votos: numero(blanco) },
        { listaCandidaturaId: null, tipo: 'NULO' as const, votos: numero(nulo) },
        { listaCandidaturaId: null, tipo: 'IMPUGNADO' as const, votos: numero(impugnado) },
      ];
      const clienteId = crypto.randomUUID();
      await db.actas.add({
        clienteId,
        mesaId,
        mesaCodigo,
        cargo: columna.cargo,
        resultados,
        observaciones: observaciones || undefined,
        fotoDataUrl: foto ?? undefined,
        digitadaEn: new Date().toISOString(),
        totalEmitidosActa: totalActa !== '' ? numero(totalActa) : undefined,
        leidaPorIA: leidaPorIA || undefined,
        estado: 'pendiente',
      });
      await db.fotosPorLeer.delete(claveFoto(mesaId, columna.cargo));
      if (navigator.onLine) await sincronizarPendientes();
      navigate(-1);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="pantalla-formulario">
      <div className="app-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="icon-btn-top" onClick={() => navigate(-1)}>
            <IconArrowLeft />
          </button>
          <div>
            <h1>{tituloCorto(columna.cargo)}</h1>
            <p>Mesa {mesaCodigo}</p>
          </div>
        </div>
      </div>

      <div className="banner-cargo">{columna.titulo}</div>

      <div className="contenido-formulario">
        <button type="button" className="fila-foto fila-foto-ia" onClick={() => fileRef.current?.click()} disabled={comprimiendo || leyendo}>
          <span className="fila-foto-icono">
            <IconCamera />
          </span>
          <span className="fila-foto-texto">
            {comprimiendo ? 'Comprimiendo…' : leyendo ? 'Leyendo el acta con IA…' : foto ? 'Foto del acta tomada' : 'Tomar foto del acta y leer con IA'}
          </span>
          <span className="fila-foto-accion">{foto ? 'Cambiar' : 'Tomar'}</span>
        </button>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={elegirFoto} />
        {foto && !leyendo && !leidaPorIA && navigator.onLine && (
          <button type="button" className="btn secundario btn-leer-ia" onClick={() => leerConIA(foto)}>
            Leer esta foto con IA
          </button>
        )}
        {mensajeIA && <div className={`mensaje ${mensajeIA.tipo}`}>{mensajeIA.texto}</div>}
        {leidaPorIA && (
          <div className="alerta-revisar">
            <strong>Revisa los números antes de guardar</strong>
            <span>La IA llenó el formulario con la foto. Compara cada casilla con el acta física y corrige lo que haga falta.</span>
            {avisosIA.length > 0 && (
              <ul>
                {avisosIA.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {columna.listas.map((lista) => (
          <div key={lista.id} className="fila-organizacion">
            {lista.simboloUrl ? (
              <img src={lista.simboloUrl} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} />
            ) : (
              <span className="simbolo-vacio" />
            )}
            <span className="nombre-organizacion">{lista.organizacion}</span>
            <input
              className="caja-votos"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="0"
              value={votos[lista.id] ?? ''}
              onChange={(e) => setVotos((prev) => ({ ...prev, [lista.id]: soloDigitos(e.target.value) }))}
            />
          </div>
        ))}

        <div className="etiqueta-seccion">OTROS VOTOS</div>

        <div className="fila-simple">
          <label>En blanco</label>
          <input className="caja-votos" type="text" inputMode="numeric" pattern="[0-9]*" placeholder="0" value={blanco} onChange={(e) => setBlanco(soloDigitos(e.target.value))} />
        </div>
        <div className="fila-simple">
          <label>Nulos</label>
          <input className="caja-votos" type="text" inputMode="numeric" pattern="[0-9]*" placeholder="0" value={nulo} onChange={(e) => setNulo(soloDigitos(e.target.value))} />
        </div>
        <div className="fila-simple">
          <label>Impugnados</label>
          <input className="caja-votos" type="text" inputMode="numeric" pattern="[0-9]*" placeholder="0" value={impugnado} onChange={(e) => setImpugnado(soloDigitos(e.target.value))} />
        </div>

        <div className="fila-simple">
          <label>Total de votos emitidos (según el acta)</label>
          <input className="caja-votos" type="text" inputMode="numeric" pattern="[0-9]*" placeholder="—" value={totalActa} onChange={(e) => setTotalActa(soloDigitos(e.target.value))} />
        </div>
        {noCuadra && (
          <div className="mensaje error">
            {totalActa !== '' && numero(totalActa) !== totalEmitidos
              ? `La suma (${totalEmitidos}) no coincide con el total del acta (${numero(totalActa)}).`
              : `La suma (${totalEmitidos}) supera a los ${electoresHabiles} electores hábiles.`}{' '}
            Si el acta física dice eso, guárdala igual: quedará como OBSERVADA para revisión.
          </div>
        )}

        {foto && <img src={foto} alt="Foto del acta" className="previsualizacion-foto" />}

        <textarea
          className="campo-observaciones"
          placeholder="Observaciones (opcional)"
          value={observaciones}
          onChange={(e) => setObservaciones(e.target.value)}
          rows={3}
        />
      </div>

      <div className="pie-formulario">
        <div className="pie-resumen">
          <div>
            <span className="valor">{validos}</span>
            Válidos
          </div>
          <div style={{ textAlign: 'right' }}>
            <span className="valor">{totalEmitidos}</span>
            <span className="etiqueta">
              Total emitidos
              <br />
              de {electoresHabiles} hábiles
            </span>
          </div>
        </div>
        {leidaPorIA && (
          <label className="check-revisado">
            <input type="checkbox" checked={revisado} onChange={(e) => setRevisado(e.target.checked)} />
            Revisé los números con el acta física
          </label>
        )}
        <button className="btn btn-guardar" onClick={guardar} disabled={guardando || comprimiendo || leyendo || (leidaPorIA && !revisado)}>
          {guardando ? 'Guardando…' : noCuadra ? 'Guardar como observada' : 'Guardar acta'}
        </button>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Cargo, CedulaMesaDTO, ColumnaCedulaDTO, DetalleActaDTO, ResultadoInput } from '@erm2026/shared';
import { db } from '../lib/db';
import { apiFetch } from '../lib/api';
import { sincronizarPendientes } from '../lib/sync';
import { obtenerCedula, tituloCorto, ESTADO_LABEL } from '../lib/mesas';
import { IconArrowLeft, IconCamera } from '../components/Icons';

// Redimensiona y recomprime la foto en el propio dispositivo antes de enviarla:
// una foto de cámara sin comprimir puede pesar varios MB, inviable con señal
// rural intermitente. Con esto queda típicamente en unos cientos de KB.
async function comprimirImagen(archivo: File): Promise<string> {
  const dataUrlOriginal: string = await new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(lector.result as string);
    lector.onerror = reject;
    lector.readAsDataURL(archivo);
  });

  const imagen = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrlOriginal;
  });

  const MAX_LADO = 1280;
  const escala = Math.min(1, MAX_LADO / Math.max(imagen.width, imagen.height));
  const ancho = Math.round(imagen.width * escala);
  const alto = Math.round(imagen.height * escala);

  const canvas = document.createElement('canvas');
  canvas.width = ancho;
  canvas.height = alto;
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrlOriginal;
  ctx.drawImage(imagen, 0, 0, ancho, alto);

  return canvas.toDataURL('image/jpeg', 0.6);
}

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
  const [votos, setVotos] = useState<Record<string, string>>({});
  const [blanco, setBlanco] = useState('');
  const [nulo, setNulo] = useState('');
  const [impugnado, setImpugnado] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [foto, setFoto] = useState<string | null>(null);
  const [comprimiendo, setComprimiendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const numero = (s: string) => Math.max(0, parseInt(s, 10) || 0);
  const validos = useMemo(() => Object.values(votos).reduce((a, b) => a + numero(b), 0), [votos]);
  const totalEmitidos = validos + numero(blanco) + numero(nulo) + numero(impugnado);

  function soloDigitos(valor: string): string {
    return valor.replace(/\D/g, '').slice(0, 5);
  }

  async function elegirFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    setComprimiendo(true);
    try {
      setFoto(await comprimirImagen(archivo));
    } finally {
      setComprimiendo(false);
    }
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
        estado: 'pendiente',
      });
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

        <button type="button" className="fila-foto" onClick={() => fileRef.current?.click()} disabled={comprimiendo}>
          <span className="fila-foto-icono">
            <IconCamera />
          </span>
          <span className="fila-foto-texto">{comprimiendo ? 'Comprimiendo…' : foto ? 'Foto tomada' : 'Foto del acta física'}</span>
          <span className="fila-foto-accion">{foto ? 'Cambiar' : 'Tomar'}</span>
        </button>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={elegirFoto} />
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
        <button className="btn btn-guardar" onClick={guardar} disabled={guardando || comprimiendo}>
          {guardando ? 'Guardando…' : 'Guardar acta'}
        </button>
      </div>
    </div>
  );
}

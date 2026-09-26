import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Cargo, CedulaMesaDTO, ColumnaCedulaDTO, ResultadoInput } from '@erm2026/shared';
import { db } from '../lib/db';
import { sincronizarPendientes } from '../lib/sync';
import { obtenerCedula, tituloCorto } from '../lib/mesas';
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

  return <Formulario mesaId={mesaId!} mesaCodigo={cedula.mesaCodigo} electoresHabiles={cedula.electoresHabiles} columna={columna} />;
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
  const [votos, setVotos] = useState<Record<string, number>>({});
  const [blanco, setBlanco] = useState(0);
  const [nulo, setNulo] = useState(0);
  const [impugnado, setImpugnado] = useState(0);
  const [observaciones, setObservaciones] = useState('');
  const [foto, setFoto] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const soloLectura = columna.estado === 'VALIDADA';

  const validos = useMemo(() => Object.values(votos).reduce((a, b) => a + b, 0), [votos]);
  const totalEmitidos = validos + blanco + nulo + impugnado;

  function cambiar(listaId: string, delta: number) {
    setVotos((prev) => ({ ...prev, [listaId]: Math.max(0, (prev[listaId] ?? 0) + delta) }));
  }

  function elegirFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    const lector = new FileReader();
    lector.onload = () => setFoto(lector.result as string);
    lector.readAsDataURL(archivo);
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
            <div className="stepper">
              <button type="button" onClick={() => cambiar(lista.id, -1)} disabled={soloLectura}>
                −
              </button>
              <input
                type="number"
                min={0}
                inputMode="numeric"
                value={votos[lista.id] ?? 0}
                onChange={(e) => setVotos((prev) => ({ ...prev, [lista.id]: Math.max(0, parseInt(e.target.value, 10) || 0) }))}
                disabled={soloLectura}
              />
              <button type="button" onClick={() => cambiar(lista.id, 1)} disabled={soloLectura}>
                +
              </button>
            </div>
          </div>
        ))}

        <div className="etiqueta-seccion">OTROS VOTOS</div>

        <div className="fila-simple">
          <label>En blanco</label>
          <input type="number" min={0} value={blanco} onChange={(e) => setBlanco(Math.max(0, parseInt(e.target.value, 10) || 0))} disabled={soloLectura} />
        </div>
        <div className="fila-simple">
          <label>Nulos</label>
          <input type="number" min={0} value={nulo} onChange={(e) => setNulo(Math.max(0, parseInt(e.target.value, 10) || 0))} disabled={soloLectura} />
        </div>
        <div className="fila-simple">
          <label>Impugnados</label>
          <input type="number" min={0} value={impugnado} onChange={(e) => setImpugnado(Math.max(0, parseInt(e.target.value, 10) || 0))} disabled={soloLectura} />
        </div>

        <button type="button" className="fila-foto" onClick={() => fileRef.current?.click()} disabled={soloLectura}>
          <span className="fila-foto-icono">
            <IconCamera />
          </span>
          <span className="fila-foto-texto">{foto ? 'Foto tomada' : 'Foto del acta física'}</span>
          <span className="fila-foto-accion">{foto ? 'Cambiar' : 'Tomar'}</span>
        </button>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={elegirFoto} />
        {foto && <img src={foto} alt="Foto del acta" className="previsualizacion-foto" />}

        <textarea
          className="campo-observaciones"
          placeholder="Observaciones (opcional)"
          value={observaciones}
          onChange={(e) => setObservaciones(e.target.value)}
          disabled={soloLectura}
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
        {!soloLectura ? (
          <button className="btn btn-guardar" onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar acta'}
          </button>
        ) : (
          <div className="aviso-validada">Esta acta ya fue validada y no se puede editar.</div>
        )}
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { obtenerMesasAsignadas, type MesaResumen } from '../lib/mesas';
import { useAuth } from '../lib/auth';
import { IconCamera, IconLogout } from '../components/Icons';
import { comprimirImagen } from '../lib/imagen';
import { leerFoto, lectorDisponible, SinConexionError } from '../lib/lector';
import { ApiError } from '../lib/api';
import MesaDetalle from './MesaDetalle';

export default function Home() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [mesas, setMesas] = useState<MesaResumen[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    obtenerMesasAsignadas()
      .then(setMesas)
      .catch(() => setError('No se pudieron cargar tus mesas asignadas.'));
  }, []);

  if (mesas === null && !error) {
    return (
      <div className="pantalla-carga">
        <p>Cargando tus mesas…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="pantalla-carga">
        <p>{error}</p>
        <button className="btn secundario" onClick={() => window.location.reload()}>
          Reintentar
        </button>
      </div>
    );
  }

  if (mesas!.length === 0) {
    return (
      <div className="pantalla-carga">
        <p>Todavía no tienes mesas asignadas.</p>
        <p className="subtexto">Coordina con tu coordinador para que te asigne una mesa.</p>
        <button className="icon-btn-top" onClick={logout} title="Cerrar sesión">
          <IconLogout />
          <span>Cerrar sesión</span>
        </button>
      </div>
    );
  }

  if (mesas!.length === 1) {
    return <MesaDetalle mesaId={mesas![0].id} />;
  }

  return (
    <div className="pantalla-lista-mesas">
      <div className="app-bar">
        <div>
          <h1>Mis mesas</h1>
          <p>Elige la mesa que vas a registrar</p>
        </div>
        <button className="icon-btn-top" onClick={logout} title="Cerrar sesión">
          <IconLogout />
        </button>
      </div>
      <LeerActaConFoto mesasPropias={new Set(mesas!.map((m) => m.id))} />
      <div className="lista-mesas">
        {mesas!.map((m) => (
          <button key={m.id} className="tarjeta-mesa" onClick={() => navigate(`/mesa/${m.id}`)}>
            <div className="tarjeta-mesa-info">
              <strong>Mesa {m.codigo}</strong>
              <span>
                {m.localVotacion} · {m.distrito}
              </span>
            </div>
            <span className="tarjeta-mesa-avance">
              {m.actasRegistradas} de {m.actasEsperadas} actas
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// Con varias mesas asignadas: la IA lee el número de mesa de la foto y abre
// directamente el formulario de esa mesa, ya prellenado para revisar.
function LeerActaConFoto({ mesasPropias }: { mesasPropias: Set<string> }) {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [estado, setEstado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    lectorDisponible().then(setVisible);
  }, []);

  async function elegir(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    setError(null);
    try {
      setEstado('Comprimiendo…');
      const foto = await comprimirImagen(archivo);
      setEstado('Leyendo el acta con IA…');
      const lectura = await leerFoto(foto);
      if (!lectura.mesaId || !lectura.cargo) {
        setError(`No se reconoció la mesa${lectura.mesaCodigoLeido ? ` ${lectura.mesaCodigoLeido}` : ''}. Abre tu mesa y toma la foto desde el formulario.`);
      } else if (!mesasPropias.has(lectura.mesaId)) {
        setError(`La foto es de la mesa ${lectura.mesaCodigo}, que no está asignada a ti.`);
      } else {
        navigate(`/mesa/${lectura.mesaId}/cargo/${lectura.cargo}`, { state: { foto, lectura } });
      }
    } catch (err) {
      setError(
        err instanceof SinConexionError
          ? 'Sin señal. Abre la mesa y toma la foto desde el formulario: quedará guardada y se leerá al volver la conexión.'
          : err instanceof ApiError
          ? err.message
          : 'No se pudo leer la foto.',
      );
    } finally {
      setEstado(null);
    }
  }

  if (!visible) return null;
  return (
    <div style={{ padding: '0 16px' }}>
      <button type="button" className="fila-foto fila-foto-ia" onClick={() => fileRef.current?.click()} disabled={!!estado}>
        <span className="fila-foto-icono">
          <IconCamera />
        </span>
        <span className="fila-foto-texto">{estado ?? 'Leer acta con foto'}</span>
        <span className="fila-foto-accion">Tomar</span>
      </button>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={elegir} />
      {error && <div className="mensaje error">{error}</div>}
    </div>
  );
}

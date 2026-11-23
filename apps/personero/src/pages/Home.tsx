import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { obtenerMesasAsignadas, type MesaResumen } from '../lib/mesas';
import { useAuth } from '../lib/auth';
import { IconLogout } from '../components/Icons';
import LeerActaConFoto from '../components/LeerActaConFoto';
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
        <button className="btn secundario" onClick={logout}>
          Cerrar sesión
        </button>
      </div>
    );
  }

  if (mesas!.length === 0) {
    return (
      <div className="pantalla-carga">
        <p>Todavía no tienes mesas asignadas.</p>
        <p className="subtexto">Coordina con tu coordinador para que te asigne una mesa.</p>
        <div style={{ width: '100%', maxWidth: 420 }}>
          <LeerActaConFoto mesasPropias={new Set()} />
        </div>
        <button className="icon-btn-top" onClick={logout} title="Cerrar sesión">
          <IconLogout />
          <span>Cerrar sesión</span>
        </button>
      </div>
    );
  }

  if (mesas!.length === 1 && mesas![0].asignada !== false) {
    return <MesaDetalle mesaId={mesas![0].id} mesasPropias={new Set([mesas![0].id])} />;
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
      <LeerActaConFoto mesasPropias={new Set(mesas!.filter((m) => m.asignada !== false).map((m) => m.id))} />
      <div className="lista-mesas">
        {mesas!.map((m) => (
          <button key={m.id} className="tarjeta-mesa" onClick={() => navigate(`/mesa/${m.id}`, { state: { noAsignada: m.asignada === false } })}>
            <div className="tarjeta-mesa-info">
              <strong>
                Mesa {m.codigo}
                {m.asignada === false && <span className="etiqueta-no-asignada">No asignada</span>}
              </strong>
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

import { useEffect, useState, useCallback } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ELECCION, type CedulaMesaDTO } from '@erm2026/shared';
import { obtenerCedula, getMesasAsignadasCount, tituloCorto, ESTADO_LABEL } from '../lib/mesas';
import { hayPendientes, sincronizarPendientes, getUltimaSync } from '../lib/sync';
import { useAuth } from '../lib/auth';
import { db, type ActaLocal } from '../lib/db';
import LeerActaConFoto from '../components/LeerActaConFoto';
import { IconArrowLeft, IconLogout, IconRefresh, IconCloudCheck, IconChevronRight, IconPin, IconBuilding } from '../components/Icons';

function tiempoRelativo(fecha: Date): string {
  const seg = Math.floor((Date.now() - fecha.getTime()) / 1000);
  if (seg < 60) return 'hace unos segundos';
  const min = Math.floor(seg / 60);
  if (min < 60) return `hace ${min} min`;
  const horas = Math.floor(min / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  return `hace ${dias} d`;
}

export default function MesaDetalle({ mesaId: mesaIdProp, mesasPropias }: { mesaId?: string; mesasPropias?: Set<string> }) {
  const params = useParams();
  const mesaId = mesaIdProp ?? params.mesaId!;
  const navigate = useNavigate();
  const location = useLocation();
  const noAsignada = !mesaIdProp && !!(location.state as { noAsignada?: boolean } | null)?.noAsignada;
  const { logout } = useAuth();
  const [duplicadas, setDuplicadas] = useState<ActaLocal[]>([]);
  const [cedula, setCedula] = useState<CedulaMesaDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendientes, setPendientes] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [ultimaSync, setUltimaSync] = useState<Date | null>(getUltimaSync());

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const data = await obtenerCedula(mesaId);
      setCedula(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar la mesa');
    }
    setPendientes(await hayPendientes());
    setDuplicadas(await db.actas.where('estado').equals('duplicada').toArray());
  }, [mesaId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    function alVolver() {
      cargar();
    }
    window.addEventListener('focus', alVolver);
    return () => window.removeEventListener('focus', alVolver);
  }, [cargar]);

  async function sincronizarAhora() {
    setSincronizando(true);
    await sincronizarPendientes();
    setUltimaSync(getUltimaSync());
    setPendientes(await hayPendientes());
    setDuplicadas(await db.actas.where('estado').equals('duplicada').toArray());
    setSincronizando(false);
  }

  const mostrarVolver = noAsignada || getMesasAsignadasCount() > 1;

  async function entendidoDuplicadas() {
    await Promise.all(duplicadas.map((a) => db.actas.update(a.clienteId, { estado: 'duplicada_vista' })));
    setDuplicadas([]);
  }

  if (error && !cedula) {
    return (
      <div className="pantalla-carga">
        <p>{error}</p>
        <button className="btn secundario" onClick={cargar}>
          Reintentar
        </button>
      </div>
    );
  }

  if (!cedula) {
    return (
      <div className="pantalla-carga">
        <p>Cargando mesa…</p>
      </div>
    );
  }

  return (
    <div className="pantalla-mesa">
      <div className="app-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {mostrarVolver && (
            <button className="icon-btn-top" onClick={() => navigate('/')}>
              <IconArrowLeft />
            </button>
          )}
          <div>
            <h1>Mesa {cedula.mesaCodigo}</h1>
            <p>{cedula.localVotacion}</p>
          </div>
        </div>
        <button className="icon-btn-top" onClick={logout} title="Cerrar sesión">
          <IconLogout />
        </button>
      </div>

      {noAsignada && (
        <div className="aviso-no-asignada">
          Esta mesa no está asignada a ti. Puedes enviar sus actas igual; quedará registrado que las enviaste tú.
        </div>
      )}

      {duplicadas.length > 0 && (
        <div className="aviso-no-asignada">
          {duplicadas.map((a) => (
            <div key={a.clienteId} style={{ marginBottom: 6 }}>
              <strong>Mesa {a.mesaCodigo}:</strong> {a.ultimoError ?? 'Esta acta ya fue enviada.'}
            </div>
          ))}
          <button className="btn secundario" style={{ marginTop: 6 }} onClick={entendidoDuplicadas}>
            Entendido
          </button>
        </div>
      )}

      {mesasPropias && <LeerActaConFoto mesasPropias={mesasPropias} />}

      <div className={`banner-sync ${pendientes ? 'pendiente' : 'ok'}`}>
        <div className="banner-sync-texto">
          <span className="banner-sync-icono">{pendientes ? <IconRefresh /> : <IconCloudCheck />}</span>
          <div>
            <strong>{pendientes ? 'Actas pendientes de enviar' : 'Todo enviado'}</strong>
            <div className="subtexto">
              {navigator.onLine
                ? pendientes
                  ? 'Se enviarán automáticamente al recuperar señal'
                  : ultimaSync
                  ? `Datos actualizados ${tiempoRelativo(ultimaSync)}`
                  : 'Conectado'
                : 'Sin conexión — se sincronizará al volver la señal'}
            </div>
          </div>
        </div>
        {pendientes && navigator.onLine && (
          <button className="icon-btn-top" onClick={sincronizarAhora} disabled={sincronizando}>
            <IconRefresh />
          </button>
        )}
      </div>

      <div className="tarjeta-eleccion">
        <strong>
          {ELECCION.nombre} — {ELECCION.regionMayus}
        </strong>
        <div className="tarjeta-eleccion-fila">
          <IconPin />
          <span>
            {cedula.distrito}, {cedula.provincia}, {ELECCION.regionMayus}
          </span>
        </div>
        <div className="tarjeta-eleccion-fila">
          <IconBuilding />
          <span>{cedula.localVotacion}</span>
        </div>
        <div className="tarjeta-eleccion-fila">
          <span className="punto-mesa">▤</span>
          <span>
            Mesa {cedula.mesaCodigo} · {cedula.electoresHabiles} electores hábiles
          </span>
        </div>
      </div>

      <div className="etiqueta-cedula">
        CÉDULA · {cedula.columnas.length} CUERPO{cedula.columnas.length === 1 ? '' : 'S'}
      </div>

      <div className="lista-cargos">
        {cedula.columnas.map((col) => {
          return (
            <button
              key={col.cargo}
              className={`tarjeta-cargo estado-${col.estado}`}
              onClick={() => navigate(`/mesa/${cedula.mesaId}/cargo/${col.cargo}`, { state: { noAsignada } })}
            >
              <div className="tarjeta-cargo-info">
                <strong>{tituloCorto(col.cargo)}</strong>
                <span className="subtexto">{col.titulo}</span>
                <span className={`estado-linea estado-${col.estado}`}>
                  <span className="estado-punto" />
                  {ESTADO_LABEL[col.estado]}
                </span>
              </div>
              <IconChevronRight />
            </button>
          );
        })}
      </div>
    </div>
  );
}

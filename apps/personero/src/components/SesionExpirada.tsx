import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { db } from '../lib/db';

// Aviso que aparece cuando el token venció. Cerrar sesión NO borra las actas ni
// las fotos pendientes: quedan en el teléfono (IndexedDB) y se envían solas al
// volver a ingresar.
export default function SesionExpirada() {
  const { sesionExpirada, logout, posponerAviso } = useAuth();
  const [pendientes, setPendientes] = useState(0);
  const [enLinea, setEnLinea] = useState(navigator.onLine);

  useEffect(() => {
    if (!sesionExpirada) return;
    Promise.all([
      db.actas.where('estado').anyOf('pendiente', 'error').count(),
      db.fotosPorLeer.where('estado').equals('esperando').count(),
    ])
      .then(([a, f]) => setPendientes(a + f))
      .catch(() => setPendientes(0));
    const on = () => setEnLinea(true);
    const off = () => setEnLinea(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, [sesionExpirada]);

  if (!sesionExpirada) return null;

  return (
    <div className="modal-fondo sesion" role="alertdialog" aria-modal="true" aria-labelledby="sesion-expirada-titulo">
      <div className="modal">
        <div className="modal-header">
          <div>
            <h3 id="sesion-expirada-titulo">Tu sesión expiró</h3>
            <p>Por seguridad, cierra sesión e ingresa de nuevo con tu DNI.</p>
          </div>
        </div>
        {pendientes > 0 && (
          <p className="nota-instalar">
            Tienes {pendientes} {pendientes === 1 ? 'acta o foto' : 'actas o fotos'} sin enviar. No se pierden: quedan
            guardadas en este teléfono y se enviarán solas cuando vuelvas a ingresar.
          </p>
        )}
        {!enLinea && (
          <p className="nota-instalar">
            Ahora no tienes señal. Para volver a ingresar necesitas conexión; mientras tanto puedes seguir digitando.
          </p>
        )}
        <div className="modal-footer acciones-sesion">
          <button className="btn" onClick={logout}>
            Cerrar sesión
          </button>
          <button className="btn secundario" onClick={posponerAviso}>
            {enLinea ? 'Ahora no' : 'Seguir sin señal'}
          </button>
        </div>
      </div>
    </div>
  );
}

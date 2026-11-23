import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { db } from '../lib/db';

// Aviso que aparece cuando el token venció. Cerrar sesión no borra las actas
// pendientes de este navegador: se envían solas al volver a ingresar.
export default function SesionExpirada() {
  const { sesionExpirada, logout } = useAuth();
  const [pendientes, setPendientes] = useState(0);

  useEffect(() => {
    if (!sesionExpirada) return;
    db.actas
      .where('estado')
      .anyOf('pendiente', 'error')
      .count()
      .then(setPendientes)
      .catch(() => setPendientes(0));
  }, [sesionExpirada]);

  if (!sesionExpirada) return null;

  return (
    <div className="modal-fondo sesion" role="alertdialog" aria-modal="true" aria-labelledby="sesion-expirada-titulo">
      <div className="modal">
        <div className="modal-header">
          <div>
            <h3 id="sesion-expirada-titulo">Tu sesión expiró</h3>
            <p>Por seguridad, cierra sesión e ingresa de nuevo con tu DNI y contraseña.</p>
          </div>
        </div>
        {pendientes > 0 && (
          <p className="aviso-sesion">
            Tienes {pendientes} {pendientes === 1 ? 'acta' : 'actas'} sin enviar en este navegador. No se pierden: se
            enviarán solas cuando vuelvas a ingresar.
          </p>
        )}
        <div className="modal-footer">
          <button className="btn" onClick={logout}>
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  );
}

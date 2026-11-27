import { useEffect, useState } from 'react';
import { db, type FotoSinMesa } from '../lib/db';
import { EVENTO_FOTOS_SIN_MESA, marcarAvisosVistos, procesarFotosSinMesa } from '../lib/fotosSinMesa';
import { tituloCorto } from '../lib/mesas';

// Aviso fijo arriba de la app:
// - "N imágenes faltan ser procesadas con la IA" mientras haya fotos sin señal.
// - "Actas enviadas" con el detalle, cuando la IA ya las leyó y se registraron.
export default function AvisoFotosSinMesa() {
  const [esperando, setEsperando] = useState(0);
  const [resultados, setResultados] = useState<FotoSinMesa[]>([]);
  const [enLinea, setEnLinea] = useState(navigator.onLine);

  useEffect(() => {
    let activo = true;
    async function cargar() {
      const todas = await db.fotosSinMesa.toArray();
      if (!activo) return;
      setEsperando(todas.filter((f) => f.estado === 'esperando').length);
      setResultados(todas.filter((f) => f.estado !== 'esperando' && !f.avisoVisto).sort((a, b) => (a.tomadaEn < b.tomadaEn ? -1 : 1)));
    }
    const onLine = () => {
      setEnLinea(navigator.onLine);
      if (navigator.onLine) procesarFotosSinMesa();
    };
    cargar();
    window.addEventListener(EVENTO_FOTOS_SIN_MESA, cargar);
    window.addEventListener('online', onLine);
    window.addEventListener('offline', onLine);
    const t = setInterval(cargar, 5000);
    return () => {
      activo = false;
      window.removeEventListener(EVENTO_FOTOS_SIN_MESA, cargar);
      window.removeEventListener('online', onLine);
      window.removeEventListener('offline', onLine);
      clearInterval(t);
    };
  }, []);

  if (esperando === 0 && resultados.length === 0) return null;

  const enviadas = resultados.filter((r) => r.estado === 'enviada');
  const otras = resultados.filter((r) => r.estado !== 'enviada');

  return (
    <div className="aviso-fotos-sin-mesa">
      {esperando > 0 && (
        <div className="aviso-fsm pendiente">
          <strong>
            {esperando === 1 ? '1 imagen falta ser procesada con la IA' : `${esperando} imágenes faltan ser procesadas con la IA`}
          </strong>
          <span>
            {enLinea
              ? 'Procesando… el acta se registrará y enviará sola.'
              : 'Están guardadas en este teléfono. Cuando vuelva la señal se leerán y las actas se enviarán solas.'}
          </span>
        </div>
      )}
      {resultados.length > 0 && (
        <div className={`aviso-fsm ${otras.length > 0 ? 'mixto' : 'listo'}`}>
          {enviadas.length > 0 && (
            <strong>{enviadas.length === 1 ? 'El acta ya fue enviada' : `Las ${enviadas.length} actas ya fueron enviadas`}</strong>
          )}
          <ul>
            {resultados.map((r) => (
              <li key={r.id}>
                {r.mesaCodigo ? `Mesa ${r.mesaCodigo}${r.cargo ? ` · ${tituloCorto(r.cargo)}` : ''}: ` : 'Foto: '}
                {r.estado === 'enviada'
                  ? r.mensaje ?? (r.observada ? 'enviada (con observaciones para revisar)' : 'enviada')
                  : r.mensaje}
              </li>
            ))}
          </ul>
          <button type="button" className="btn secundario" onClick={() => marcarAvisosVistos()}>
            Entendido
          </button>
        </div>
      )}
    </div>
  );
}

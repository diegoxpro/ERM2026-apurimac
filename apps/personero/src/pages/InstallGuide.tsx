import { useState } from 'react';
import { IconClose, IconDownload, IconShare, IconPlusSquare } from '../components/Icons';

export default function InstallGuide({ onCerrar }: { onCerrar: () => void }) {
  const [tab, setTab] = useState<'android' | 'ios'>('android');

  return (
    <div className="modal-fondo" onClick={onCerrar}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>Instalar la app</h3>
            <p>Así no necesitas abrir el navegador cada vez</p>
          </div>
          <button onClick={onCerrar}>
            <IconClose />
          </button>
        </div>

        <div className="tabs-instalar">
          <button className={tab === 'android' ? 'activo' : ''} onClick={() => setTab('android')}>
            Android
          </button>
          <button className={tab === 'ios' ? 'activo' : ''} onClick={() => setTab('ios')}>
            iPhone
          </button>
        </div>

        {tab === 'android' ? (
          <ol className="pasos-instalar">
            <li>
              Abre esta página en <strong>Chrome</strong>.
            </li>
            <li>
              Toca el menú <strong>⋮</strong> (tres puntos) arriba a la derecha.
            </li>
            <li>
              Elige <strong>"Instalar aplicación"</strong> o <strong>"Agregar a pantalla de inicio"</strong>.
              <span className="icono-paso">
                <IconDownload />
              </span>
            </li>
            <li>
              Confirma tocando <strong>"Instalar"</strong>. El ícono de Personeros aparecerá en tu pantalla de inicio.
            </li>
          </ol>
        ) : (
          <ol className="pasos-instalar">
            <li>
              Abre esta página en <strong>Safari</strong> (no funciona desde Chrome en iPhone).
            </li>
            <li>
              Toca el botón <strong>Compartir</strong> en la barra inferior.
              <span className="icono-paso">
                <IconShare />
              </span>
            </li>
            <li>
              Desplázate y elige <strong>"Agregar a pantalla de inicio"</strong>.
              <span className="icono-paso">
                <IconPlusSquare />
              </span>
            </li>
            <li>
              Toca <strong>"Agregar"</strong> arriba a la derecha. El ícono de Personeros aparecerá en tu pantalla de inicio.
            </li>
          </ol>
        )}

        <p className="nota-instalar">
          Una vez instalada, la app funciona incluso con poca señal: las actas se guardan en tu celular y se envían solas
          cuando recuperas conexión.
        </p>

        <div className="modal-footer">
          <button className="btn" onClick={onCerrar}>
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}

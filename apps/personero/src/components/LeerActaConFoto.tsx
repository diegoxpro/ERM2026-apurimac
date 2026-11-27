import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconCamera, IconImage } from './Icons';
import { comprimirImagen } from '../lib/imagen';
import { leerFoto, lectorDisponible, SinConexionError } from '../lib/lector';
import { apiFetch, ApiError } from '../lib/api';
import { obtenerMesasAsignadas } from '../lib/mesas';
import { EVENTO_FOTOS_SIN_MESA, guardarFotoSinMesa } from '../lib/fotosSinMesa';

// La IA lee el número de mesa de la foto y abre directamente el formulario de
// esa mesa, ya prellenado para revisar. Sirve también para mesas que NO están
// asignadas al personero (p.ej. cubre a un compañero): se le advierte, pero
// puede enviarla igual. Si esa acta ya fue enviada, se le avisa y no se abre.
export default function LeerActaConFoto({ mesasPropias }: { mesasPropias?: Set<string> }) {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  // Sin "capture": abre la galería/archivos para usar una foto ya tomada.
  const galeriaRef = useRef<HTMLInputElement>(null);
  const [estado, setEstado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [conIA, setConIA] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [mostrarBuscar, setMostrarBuscar] = useState(false);

  useEffect(() => {
    lectorDisponible().then(setConIA);
    // Cuando la cola de fotos sin señal se procesa, el aviso de arriba toma el relevo.
    const limpiar = () => navigator.onLine && setInfo(null);
    window.addEventListener(EVENTO_FOTOS_SIN_MESA, limpiar);
    return () => window.removeEventListener(EVENTO_FOTOS_SIN_MESA, limpiar);
  }, []);

  async function esPropia(mesaId: string): Promise<boolean> {
    if (mesasPropias) return mesasPropias.has(mesaId);
    try {
      const propias = await obtenerMesasAsignadas();
      return propias.some((m) => m.id === mesaId);
    } catch {
      return false;
    }
  }

  async function elegir(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    setError(null);
    setInfo(null);
    let foto: string | null = null;
    try {
      setEstado('Comprimiendo…');
      foto = await comprimirImagen(archivo);
      if (!navigator.onLine) throw new SinConexionError('Sin conexión');
      setEstado('Leyendo el acta con IA…');
      const lectura = await leerFoto(foto);
      if (!lectura.mesaId || !lectura.cargo) {
        setError(`No se reconoció la mesa${lectura.mesaCodigoLeido ? ` ${lectura.mesaCodigoLeido}` : ''}. Busca la mesa por su número y toma la foto desde el formulario.`);
      } else if (lectura.yaEnviada) {
        setError(
          `Esta acta de la mesa ${lectura.mesaCodigo} ya fue enviada por ${lectura.yaEnviada.personeroNombre} ` +
            `(${new Date(lectura.yaEnviada.digitadaEn).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' })}). No hace falta enviarla otra vez.`,
        );
      } else {
        const noAsignada = !(await esPropia(lectura.mesaId));
        navigate(`/mesa/${lectura.mesaId}/cargo/${lectura.cargo}`, { state: { foto, lectura, noAsignada } });
      }
    } catch (err) {
      if (err instanceof SinConexionError && foto) {
        // Sin señal: la foto se guarda en el teléfono y se procesa sola al volver la conexión.
        const n = await guardarFotoSinMesa(foto);
        setInfo(
          `Sin señal: la foto quedó guardada en este teléfono. ${n === 1 ? 'Falta 1 imagen' : `Faltan ${n} imágenes`} por procesar con la IA; ` +
            'cuando vuelva la señal se leerán y las actas se enviarán solas. Puedes seguir escaneando.',
        );
      } else {
        setError(err instanceof ApiError ? err.message : 'No se pudo leer la foto.');
      }
    } finally {
      setEstado(null);
    }
  }

  async function buscarMesa(e: React.FormEvent) {
    e.preventDefault();
    const buscado = codigo.trim();
    if (!buscado) return;
    setError(null);
    setBuscando(true);
    try {
      const r = await apiFetch<{ items: { id: string; codigo: string }[] }>(`/api/mesas?search=${encodeURIComponent(buscado)}&limit=20`);
      const mesa = r.items.find((m) => m.codigo === buscado) ?? r.items.find((m) => m.codigo.endsWith(buscado));
      if (!mesa) {
        setError(`No se encontró la mesa ${buscado} en el padrón.`);
        return;
      }
      const noAsignada = !(await esPropia(mesa.id));
      navigate(`/mesa/${mesa.id}`, { state: { noAsignada } });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sin señal: para abrir otra mesa necesitas conexión.');
    } finally {
      setBuscando(false);
    }
  }

  return (
    <div style={{ padding: '0 16px' }}>
      {conIA && (
        <>
          <button type="button" className="fila-foto fila-foto-ia" onClick={() => fileRef.current?.click()} disabled={!!estado}>
            <span className="fila-foto-icono">
              <IconCamera />
            </span>
            <span className="fila-foto-texto">{estado ?? 'Leer acta con foto (cualquier mesa)'}</span>
            <span className="fila-foto-accion">Tomar</span>
          </button>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={elegir} />
          <button type="button" className="enlace-galeria" onClick={() => galeriaRef.current?.click()} disabled={!!estado}>
            <IconImage /> Elegir foto de la galería
          </button>
          <input ref={galeriaRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={elegir} />
        </>
      )}
      {mostrarBuscar ? (
        <form className="buscar-otra-mesa" onSubmit={buscarMesa}>
          <input
            type="text"
            inputMode="numeric"
            placeholder="N° de mesa"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
            autoFocus
          />
          <button className="btn" type="submit" disabled={buscando || !codigo}>
            {buscando ? 'Buscando…' : 'Abrir'}
          </button>
        </form>
      ) : (
        <button type="button" className="enlace-otra-mesa" onClick={() => setMostrarBuscar(true)}>
          ¿Acta de una mesa que no es tuya? Búscala por su número
        </button>
      )}
      {info && <div className="mensaje info">{info}</div>}
      {error && <div className="mensaje error">{error}</div>}
    </div>
  );
}

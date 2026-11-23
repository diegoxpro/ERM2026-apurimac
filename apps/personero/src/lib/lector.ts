import type { Cargo, LecturaActaDTO } from '@erm2026/shared';
import { apiFetch, ApiError } from './api';
import { db } from './db';

// Lector de actas: envía la foto al servidor, que la lee con IA y devuelve los
// números para prellenar el formulario. La persona siempre revisa antes de guardar.

export class SinConexionError extends Error {}

export async function leerFoto(fotoDataUrl: string, mesaId?: string, cargo?: Cargo): Promise<LecturaActaDTO> {
  if (!navigator.onLine) throw new SinConexionError('Sin conexión');
  try {
    return await apiFetch<LecturaActaDTO>('/api/actas/leer', {
      method: 'POST',
      body: JSON.stringify({ fotoBase64: fotoDataUrl, mesaId, cargo }),
    });
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new SinConexionError('Sin conexión');
  }
}

export function claveFoto(mesaId: string, cargo: Cargo) {
  return `${mesaId}|${cargo}`;
}

export async function encolarFoto(mesaId: string, cargo: Cargo, fotoDataUrl: string) {
  await db.fotosPorLeer.put({
    clave: claveFoto(mesaId, cargo),
    mesaId,
    cargo,
    fotoDataUrl,
    tomadaEn: new Date().toISOString(),
    estado: 'esperando',
  });
}

let leyendo = false;

// Lee las fotos que se tomaron sin señal. Se llama al volver la conexión y
// periódicamente; el resultado queda guardado para revisarlo en el formulario.
export async function leerFotosEnCola(): Promise<number> {
  if (leyendo || !navigator.onLine) return 0;
  leyendo = true;
  let leidas = 0;
  try {
    const cola = await db.fotosPorLeer.where('estado').equals('esperando').toArray();
    for (const f of cola) {
      try {
        const lectura = await leerFoto(f.fotoDataUrl, f.mesaId, f.cargo);
        await db.fotosPorLeer.update(f.clave, { estado: 'leida', lectura, error: undefined });
        leidas++;
      } catch (e) {
        if (e instanceof SinConexionError) break;
        await db.fotosPorLeer.update(f.clave, { estado: 'error', error: e instanceof Error ? e.message : 'Error' });
      }
    }
  } finally {
    leyendo = false;
  }
  return leidas;
}

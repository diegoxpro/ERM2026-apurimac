import type { Vuelta } from '@erm2026/shared';

/**
 * Vuelta con la que opera el sistema (cédula, digitación, avance y resultados).
 * Se controla con la variable de entorno VUELTA_ACTIVA=PRIMERA|SEGUNDA; cambiarla
 * solo requiere reiniciar el contenedor `api`. Los datos de la otra vuelta se
 * conservan y se pueden consultar pasando ?vuelta=... a los endpoints de lectura.
 */
export function vueltaActiva(): Vuelta {
  return process.env.VUELTA_ACTIVA?.trim().toUpperCase() === 'SEGUNDA' ? 'SEGUNDA' : 'PRIMERA';
}

/** Lee ?vuelta= de la query; si no viene o no es válida, usa la vuelta activa. */
export function vueltaDeQuery(valor: unknown): Vuelta {
  const v = String(valor ?? '').trim().toUpperCase();
  if (v === 'PRIMERA' || v === 'SEGUNDA') return v;
  return vueltaActiva();
}

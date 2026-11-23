import { prisma } from './prisma';

// Configuración del lector de actas. Lo que el administrador guarda en el panel
// manda; si no guardó nada, se usan las variables de entorno del servidor.

export const MODELOS_LECTOR = [
  { id: 'claude-opus-5-5', nombre: 'Claude Opus 5.5', detalle: 'El más preciso · ~US$ 0.03 por foto · 5–10 s' },
  { id: 'claude-sonnet-5-5', nombre: 'Claude Sonnet 5.5', detalle: 'Intermedio · ~US$ 0.015 por foto · 4–8 s' },
  { id: 'claude-haiku-5-5', nombre: 'Claude Haiku 5.5', detalle: 'El más barato · ~US$ 0.001 por foto · 2–4 s' },
] as const;

export const MODELO_POR_DEFECTO = process.env.LECTOR_ACTAS_MODELO || 'claude-opus-5-5';

const CLAVES = { activo: 'lector.activo', modelo: 'lector.modelo', apiKey: 'lector.apiKey' } as const;

export interface ConfigLector {
  activo: boolean;
  modelo: string;
  apiKey: string | null;
  origenClave: 'panel' | 'servidor' | null;
}

let cache: { valor: ConfigLector; hasta: number } | null = null;

export async function obtenerConfigLector(): Promise<ConfigLector> {
  if (cache && cache.hasta > Date.now()) return cache.valor;
  const filas = await prisma.configuracion.findMany({ where: { clave: { in: Object.values(CLAVES) } } });
  const mapa = new Map(filas.map((f) => [f.clave, f.valor]));
  const clavePanel = mapa.get(CLAVES.apiKey) || null;
  const claveEnv = process.env.ANTHROPIC_API_KEY || null;
  const valor: ConfigLector = {
    activo: mapa.has(CLAVES.activo) ? mapa.get(CLAVES.activo) === 'true' : true,
    modelo: mapa.get(CLAVES.modelo) || MODELO_POR_DEFECTO,
    apiKey: clavePanel ?? claveEnv,
    origenClave: clavePanel ? 'panel' : claveEnv ? 'servidor' : null,
  };
  cache = { valor, hasta: Date.now() + 15_000 };
  return valor;
}

export async function guardarConfigLector(cambios: { activo?: boolean; modelo?: string; apiKey?: string | null }) {
  const ops = [];
  const upsert = (clave: string, valor: string) =>
    prisma.configuracion.upsert({ where: { clave }, update: { valor }, create: { clave, valor } });
  if (cambios.activo !== undefined) ops.push(upsert(CLAVES.activo, String(cambios.activo)));
  if (cambios.modelo !== undefined) ops.push(upsert(CLAVES.modelo, cambios.modelo));
  if (cambios.apiKey !== undefined) {
    ops.push(
      cambios.apiKey
        ? upsert(CLAVES.apiKey, cambios.apiKey)
        : prisma.configuracion.deleteMany({ where: { clave: CLAVES.apiKey } }),
    );
  }
  await prisma.$transaction(ops);
  cache = null;
}

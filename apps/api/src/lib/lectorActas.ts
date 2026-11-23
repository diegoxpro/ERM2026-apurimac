import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import * as z from 'zod/v4';
import { obtenerConfigLector } from './configuracion';

// Lector de actas: recibe la foto del acta física y devuelve los números
// escritos a mano, usando la IA de visión de Claude. El resultado NUNCA se
// guarda directamente: vuelve al formulario para que la persona lo revise.

// Motivo por el que el lector no se puede usar, o null si está listo.
export async function motivoLectorNoDisponible(): Promise<string | null> {
  const cfg = await obtenerConfigLector();
  if (!cfg.activo) return 'La lectura con IA está desactivada. Digita los datos a mano.';
  if (!cfg.apiKey) return 'La lectura con IA no tiene una clave de Anthropic configurada. Digita los datos a mano.';
  return null;
}

const LecturaSchema = z.object({
  es_acta: z.boolean().describe('true si la imagen es un acta electoral de escrutinio legible'),
  mesa_codigo: z.string().describe('Número de "Mesa de sufragio N°", solo dígitos tal como aparece (normalmente 6). Vacío si no se lee'),
  electores_habiles: z.number().int().nullable().describe('Total de electores hábiles impreso en el acta, o null'),
  organizaciones: z
    .array(
      z.object({
        nombre: z.string().describe('Nombre de la organización política tal como aparece impreso'),
        votos: z.number().int().nullable().describe('Votos escritos a mano; null si la casilla está vacía o ilegible'),
      }),
    )
    .describe('Una entrada por cada fila de organización política, en el orden del acta'),
  votos_blanco: z.number().int().nullable(),
  votos_nulos: z.number().int().nullable(),
  votos_impugnados: z.number().int().nullable(),
  total_emitidos: z.number().int().nullable().describe('Número escrito en "Total de votos emitidos"'),
  dudas: z
    .array(z.string())
    .describe('Casillas cuyo número es dudoso o ilegible, con una explicación breve en español. Vacío si todo es claro'),
});

export type LecturaActa = z.infer<typeof LecturaSchema>;

const INSTRUCCIONES = `Eres un lector de actas electorales peruanas (ONPE). Recibes la foto de un "Acta electoral", sección "Acta de escrutinio".
Transcribe exactamente lo que está escrito; no corrijas ni completes cifras para que la suma cuadre: si el total escrito no coincide con la suma, igual devuelve lo escrito.
- mesa_codigo: el número impreso en el recuadro "Mesa de sufragio N°".
- Los votos de cada fila están escritos a mano en la columna "Total de votos".
- Si una casilla está vacía o tachada sin cifra clara, usa null y explícalo en "dudas".
- Si un dígito es ambiguo (1/7, 4/9, 5/6, 0/6), elige la lectura más probable y anótalo en "dudas".
- Si la imagen no es un acta o es ilegible, es_acta = false.`;

let cliente: { apiKey: string; c: Anthropic } | null = null;

export function clienteAnthropic(apiKey: string): Anthropic {
  if (!cliente || cliente.apiKey !== apiKey) cliente = { apiKey, c: new Anthropic({ apiKey, timeout: 60_000, maxRetries: 2 }) };
  return cliente.c;
}

export class LectorError extends Error {}

export async function leerActa(fotoDataUrl: string): Promise<LecturaActa> {
  const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/s.exec(fotoDataUrl);
  if (!m) throw new LectorError('La foto no tiene un formato válido');
  const mediaType = m[1] as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

  const cfg = await obtenerConfigLector();
  if (!cfg.apiKey) throw new LectorError('La lectura con IA no tiene una clave de Anthropic configurada.');

  const respuesta = await clienteAnthropic(cfg.apiKey).messages.parse({
    model: cfg.modelo,
    max_tokens: 4000,
    output_config: { effort: 'low', format: zodOutputFormat(LecturaSchema) },
    system: INSTRUCCIONES,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: m[2] } },
          { type: 'text', text: 'Lee esta acta y devuelve los datos.' },
        ],
      },
    ],
  });

  if (respuesta.stop_reason === 'refusal' || !respuesta.parsed_output) {
    throw new LectorError('La IA no pudo leer esta foto. Digita los datos a mano.');
  }
  console.log(
    `[lector] ${cfg.modelo} entrada=${respuesta.usage.input_tokens} salida=${respuesta.usage.output_tokens} tokens`,
  );
  return respuesta.parsed_output;
}

// Normaliza un nombre para emparejar lo impreso en el acta ("SOMOS PERU") con
// el catálogo ("PARTIDO DEMOCRATICO SOMOS PERU").
export function normalizarNombre(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\b(PARTIDO|POLITICO|DEMOCRATICO|MOVIMIENTO|REGIONAL|ALIANZA|ELECTORAL|ORGANIZACION|DEL|DE|LA|EL|LOS)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function emparejarOrganizacion<T extends { organizacion: string }>(nombreLeido: string, listas: T[]): T | undefined {
  const leido = normalizarNombre(nombreLeido);
  if (!leido) return undefined;
  return (
    listas.find((l) => normalizarNombre(l.organizacion) === leido) ??
    listas.find((l) => {
      const cat = normalizarNombre(l.organizacion);
      return cat.includes(leido) || leido.includes(cat);
    })
  );
}

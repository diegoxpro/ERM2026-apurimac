// Prueba el lector de actas con fotos locales, sin pasar por la app.
// Uso: ANTHROPIC_API_KEY=... npx tsx scripts/probar-lector.ts foto1.png foto2.jpg
import { readFileSync } from 'fs';
import { extname } from 'path';
import { leerActa, MODELO_LECTOR } from '../src/lib/lectorActas';

async function main() {
  const archivos = process.argv.slice(2);
  if (archivos.length === 0) throw new Error('Indica al menos una foto');
  console.log(`Modelo: ${MODELO_LECTOR}`);
  for (const archivo of archivos) {
    const tipo = extname(archivo).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';
    const dataUrl = `data:${tipo};base64,${readFileSync(archivo).toString('base64')}`;
    const inicio = Date.now();
    const lectura = await leerActa(dataUrl);
    const suma =
      lectura.organizaciones.reduce((a, o) => a + (o.votos ?? 0), 0) +
      (lectura.votos_blanco ?? 0) + (lectura.votos_nulos ?? 0) + (lectura.votos_impugnados ?? 0);
    console.log(`\n${archivo} (${((Date.now() - inicio) / 1000).toFixed(1)} s)`);
    console.log(JSON.stringify(lectura, null, 2));
    console.log(`Suma ${suma} vs total escrito ${lectura.total_emitidos}: ${suma === lectura.total_emitidos ? 'cuadra' : 'NO cuadra'}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

/**
 * Carga las dos fórmulas de Gobernador y Vicegobernador Regional que pasan a
 * segunda vuelta, desde data/seed/segunda-vuelta.json. No toca nada de la
 * primera vuelta (listas, actas ni resultados).
 *
 * Formato del JSON:
 *   { "organizaciones": [ { "organizacion": "NOMBRE EXACTO", "orden": 1 }, { ... "orden": 2 } ] }
 * El nombre debe coincidir con data/seed/organizaciones.json; "orden" es la
 * posición en la cédula de segunda vuelta.
 *
 * Es idempotente: se puede volver a correr si cambia el orden. Si ya hay actas
 * de segunda vuelta registradas, se niega a quitar organizaciones.
 */
const prisma = new PrismaClient();
const ARCHIVO = path.join(__dirname, '..', '..', '..', 'data', 'seed', 'segunda-vuelta.json');

interface Config {
  organizaciones: { organizacion: string; orden: number }[];
}

async function main() {
  const config: Config = JSON.parse(fs.readFileSync(ARCHIVO, 'utf8'));
  const orgs = config.organizaciones ?? [];
  if (orgs.length !== 2) {
    throw new Error(`segunda-vuelta.json debe tener exactamente 2 organizaciones (tiene ${orgs.length}).`);
  }
  if (new Set(orgs.map((o) => o.orden)).size !== 2) {
    throw new Error('Las 2 organizaciones deben tener un "orden" distinto.');
  }

  const ids: string[] = [];
  for (const o of orgs) {
    const org = await prisma.organizacionPolitica.findUnique({ where: { nombre: o.organizacion } });
    if (!org) throw new Error(`Organización no encontrada: "${o.organizacion}". Usa el nombre exacto de organizaciones.json.`);
    // Debe haber postulado a Gobernador en primera vuelta.
    const enPrimera = await prisma.listaCandidatura.findFirst({
      where: { cargo: 'GOBERNADOR_REGIONAL', vuelta: 'PRIMERA', organizacionId: org.id },
    });
    if (!enPrimera) throw new Error(`"${o.organizacion}" no tiene lista de Gobernador Regional en primera vuelta.`);

    const lista = await prisma.listaCandidatura.upsert({
      where: {
        cargo_provinciaNombre_distritoNombre_organizacionId_vuelta: {
          cargo: 'GOBERNADOR_REGIONAL',
          provinciaNombre: '',
          distritoNombre: '',
          organizacionId: org.id,
          vuelta: 'SEGUNDA',
        },
      },
      update: { orden: o.orden },
      create: {
        cargo: 'GOBERNADOR_REGIONAL',
        provinciaNombre: '',
        distritoNombre: '',
        organizacionId: org.id,
        vuelta: 'SEGUNDA',
        orden: o.orden,
        expediente: enPrimera.expediente,
        jee: enPrimera.jee,
      },
    });
    ids.push(lista.id);
    console.log(`  ${o.orden}. ${o.organizacion}`);
  }

  // Quita listas de segunda vuelta que ya no estén en el archivo (p. ej. se
  // corrió antes con otra organización), solo si no tienen votos registrados.
  const sobrantes = await prisma.listaCandidatura.findMany({
    where: { vuelta: 'SEGUNDA', id: { notIn: ids } },
    include: { _count: { select: { resultados: true } } },
  });
  for (const s of sobrantes) {
    if (s._count.resultados > 0) {
      throw new Error('Hay una lista de segunda vuelta con votos registrados que no está en el archivo; no se elimina.');
    }
    await prisma.listaCandidatura.delete({ where: { id: s.id } });
  }

  console.log('Listas de segunda vuelta cargadas. Activa la vuelta con VUELTA_ACTIVA=SEGUNDA y reinicia la API.');
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

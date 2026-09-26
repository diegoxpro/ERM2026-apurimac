import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();
const SEED_DIR = path.join(__dirname, '..', '..', '..', 'data', 'seed');

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(path.join(SEED_DIR, file), 'utf8'));
}

interface MesaRow {
  provincia: string;
  distrito: string;
  codigoLV: string;
  nombreLV: string;
  direccionLV: string;
  mesa: string;
  aula: string;
  piso: string;
  pabellon: string;
  electores: number;
  electoresDiscapacidad: number;
}

interface DistritoRow {
  provincia: string;
  distrito: string;
  capitalDeProvincia: boolean;
}

interface OrganizacionRow {
  nombre: string;
  simboloUrl: string;
}

interface ListaRow {
  cargo: 'GOBERNADOR_REGIONAL' | 'CONSEJERO_REGIONAL' | 'ALCALDE_PROVINCIAL' | 'ALCALDE_DISTRITAL';
  nivel: 'REGION' | 'PROVINCIA' | 'DISTRITO';
  provincia?: string;
  distrito?: string;
  organizacion: string;
  orden: number;
  simboloUrl: string;
  expediente: string;
  jee: string;
}

async function main() {
  console.log('--- Seed: organizaciones políticas ---');
  const organizaciones = readJson<OrganizacionRow[]>('organizaciones.json');
  const orgIdByNombre = new Map<string, string>();
  for (const org of organizaciones) {
    const row = await prisma.organizacionPolitica.upsert({
      where: { nombre: org.nombre },
      update: { simboloUrl: org.simboloUrl },
      create: { nombre: org.nombre, simboloUrl: org.simboloUrl },
    });
    orgIdByNombre.set(org.nombre, row.id);
  }
  console.log(`  ${organizaciones.length} organizaciones`);

  console.log('--- Seed: provincias y distritos ---');
  const distritos = readJson<DistritoRow[]>('distritos.json');
  const provinciaIdByNombre = new Map<string, string>();
  const distritoIdByKey = new Map<string, string>();
  for (const d of distritos) {
    let provinciaId = provinciaIdByNombre.get(d.provincia);
    if (!provinciaId) {
      const provRow = await prisma.provincia.upsert({
        where: { nombre: d.provincia },
        update: {},
        create: { nombre: d.provincia },
      });
      provinciaId = provRow.id;
      provinciaIdByNombre.set(d.provincia, provinciaId);
    }
    const distRow = await prisma.distrito.upsert({
      where: { provinciaId_nombre: { provinciaId, nombre: d.distrito } },
      update: { capitalDeProvincia: d.capitalDeProvincia },
      create: { provinciaId, nombre: d.distrito, capitalDeProvincia: d.capitalDeProvincia },
    });
    distritoIdByKey.set(`${d.provincia}:${d.distrito}`, distRow.id);
  }
  console.log(`  ${provinciaIdByNombre.size} provincias, ${distritos.length} distritos`);

  console.log('--- Seed: locales de votación y mesas ---');
  const mesas = readJson<MesaRow[]>('mesas.json');
  const localIdByCodigo = new Map<string, string>();
  let mesasCreadas = 0;
  for (const m of mesas) {
    let localId = localIdByCodigo.get(m.codigoLV);
    if (!localId) {
      const distritoId = distritoIdByKey.get(`${m.provincia}:${m.distrito}`);
      if (!distritoId) throw new Error(`Distrito no encontrado para mesa: ${m.provincia}/${m.distrito}`);
      const localRow = await prisma.localVotacion.upsert({
        where: { codigo: m.codigoLV },
        update: { nombre: m.nombreLV, direccion: m.direccionLV, distritoId },
        create: { codigo: m.codigoLV, nombre: m.nombreLV, direccion: m.direccionLV, distritoId },
      });
      localId = localRow.id;
      localIdByCodigo.set(m.codigoLV, localId);
    }
    await prisma.mesa.upsert({
      where: { codigo: m.mesa },
      update: {
        aula: m.aula,
        piso: m.piso,
        pabellon: m.pabellon,
        electores: m.electores,
        electoresDiscapacidad: m.electoresDiscapacidad,
        localVotacionId: localId,
      },
      create: {
        codigo: m.mesa,
        aula: m.aula,
        piso: m.piso,
        pabellon: m.pabellon,
        electores: m.electores,
        electoresDiscapacidad: m.electoresDiscapacidad,
        localVotacionId: localId,
      },
    });
    mesasCreadas++;
  }
  console.log(`  ${localIdByCodigo.size} locales de votación, ${mesasCreadas} mesas`);

  console.log('--- Seed: listas de candidatura ---');
  const listas = readJson<ListaRow[]>('listas-candidatura.json');
  let listasCreadas = 0;
  for (const l of listas) {
    const organizacionId = orgIdByNombre.get(l.organizacion);
    if (!organizacionId) throw new Error(`Organización no encontrada: ${l.organizacion}`);
    await prisma.listaCandidatura.upsert({
      where: {
        cargo_provinciaNombre_distritoNombre_organizacionId: {
          cargo: l.cargo,
          provinciaNombre: l.provincia ?? '',
          distritoNombre: l.distrito ?? '',
          organizacionId,
        },
      },
      update: { orden: l.orden, expediente: l.expediente, jee: l.jee },
      create: {
        cargo: l.cargo,
        provinciaNombre: l.provincia ?? '',
        distritoNombre: l.distrito ?? '',
        organizacionId,
        orden: l.orden,
        expediente: l.expediente,
        jee: l.jee,
      },
    });
    listasCreadas++;
  }
  console.log(`  ${listasCreadas} listas de candidatura`);

  console.log('--- Seed: usuarios de prueba ---');
  const passwordHash = await bcrypt.hash('cambiar123', 10);
  await prisma.usuario.upsert({
    where: { dni: '00000001' },
    update: {},
    create: {
      dni: '00000001',
      nombre: 'Administrador General',
      email: 'admin@erm2026.local',
      passwordHash,
      rol: 'ADMIN',
    },
  });
  const coordinador = await prisma.usuario.upsert({
    where: { dni: '00000002' },
    update: {},
    create: {
      dni: '00000002',
      nombre: 'Coordinador Apurímac',
      email: 'coordinador@erm2026.local',
      passwordHash,
      rol: 'COORDINADOR',
    },
  });
  await prisma.usuario.upsert({
    where: { dni: '00000003' },
    update: { coordinadorId: coordinador.id },
    create: {
      dni: '00000003',
      nombre: 'Personero de Prueba',
      email: 'personero@erm2026.local',
      passwordHash,
      rol: 'PERSONERO',
      coordinadorId: coordinador.id,
    },
  });
  console.log('  usuarios admin/coordinador/personero con contraseña "cambiar123" (cámbiala antes de producción)');

  console.log('\nSeed completado.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

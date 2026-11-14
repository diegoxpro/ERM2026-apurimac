import type { Cargo } from '@erm2026/shared';
import { prisma } from './prisma';

// Devuelve una función que cuenta cuántas actas (una por cargo con listas) le
// corresponden a una mesa según su provincia/distrito. Así una segunda vuelta
// (solo Gobernador) espera 1 acta por mesa, y la primera vuelta 3 o 4.
export async function contadorActasEsperadas() {
  const grupos = await prisma.listaCandidatura.groupBy({ by: ['cargo', 'provinciaNombre', 'distritoNombre'] });
  const claves = new Set(grupos.map((g) => `${g.cargo}|${g.provinciaNombre}|${g.distritoNombre}`));
  return (provincia: string, distrito: string, capitalDeProvincia: boolean) => {
    let n = 0;
    if (claves.has('GOBERNADOR_REGIONAL||')) n++;
    if (claves.has(`CONSEJERO_REGIONAL|${provincia}|`)) n++;
    if (claves.has(`ALCALDE_PROVINCIAL|${provincia}|`)) n++;
    if (!capitalDeProvincia && claves.has(`ALCALDE_DISTRITAL|${provincia}|${distrito}`)) n++;
    return n;
  };
}

export async function cargosConListas(): Promise<Set<Cargo>> {
  const filas = await prisma.listaCandidatura.findMany({ select: { cargo: true }, distinct: ['cargo'] });
  return new Set(filas.map((f) => f.cargo));
}

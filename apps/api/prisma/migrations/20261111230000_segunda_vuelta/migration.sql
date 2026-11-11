-- CreateEnum
CREATE TYPE "Vuelta" AS ENUM ('PRIMERA', 'SEGUNDA');

-- DropIndex
DROP INDEX "ListaCandidatura_cargo_provinciaNombre_distritoNombre_organ_key";

-- DropIndex
DROP INDEX "Acta_mesaId_cargo_key";

-- AlterTable
ALTER TABLE "ListaCandidatura" ADD COLUMN     "vuelta" "Vuelta" NOT NULL DEFAULT 'PRIMERA';

-- AlterTable
ALTER TABLE "Acta" ADD COLUMN     "vuelta" "Vuelta" NOT NULL DEFAULT 'PRIMERA';

-- CreateIndex
CREATE UNIQUE INDEX "ListaCandidatura_cargo_provinciaNombre_distritoNombre_organ_key" ON "ListaCandidatura"("cargo", "provinciaNombre", "distritoNombre", "organizacionId", "vuelta");

-- CreateIndex
CREATE UNIQUE INDEX "Acta_mesaId_cargo_vuelta_key" ON "Acta"("mesaId", "cargo", "vuelta");


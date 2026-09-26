-- CreateEnum
CREATE TYPE "RolUsuario" AS ENUM ('ADMIN', 'COORDINADOR', 'PERSONERO');

-- CreateEnum
CREATE TYPE "Cargo" AS ENUM ('GOBERNADOR_REGIONAL', 'CONSEJERO_REGIONAL', 'ALCALDE_PROVINCIAL', 'ALCALDE_DISTRITAL');

-- CreateEnum
CREATE TYPE "EstadoActa" AS ENUM ('ENVIADA', 'VALIDADA', 'OBSERVADA');

-- CreateEnum
CREATE TYPE "TipoResultado" AS ENUM ('VOTO_LISTA', 'BLANCO', 'NULO', 'IMPUGNADO');

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "dni" TEXT NOT NULL,
    "email" TEXT,
    "telefono" TEXT,
    "passwordHash" TEXT NOT NULL,
    "rol" "RolUsuario" NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "coordinadorId" TEXT,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Provincia" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,

    CONSTRAINT "Provincia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Distrito" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "capitalDeProvincia" BOOLEAN NOT NULL DEFAULT false,
    "provinciaId" TEXT NOT NULL,

    CONSTRAINT "Distrito_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocalVotacion" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "direccion" TEXT,
    "distritoId" TEXT NOT NULL,

    CONSTRAINT "LocalVotacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mesa" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "aula" TEXT,
    "piso" TEXT,
    "pabellon" TEXT,
    "electores" INTEGER NOT NULL DEFAULT 0,
    "electoresDiscapacidad" INTEGER NOT NULL DEFAULT 0,
    "localVotacionId" TEXT NOT NULL,
    "personeroId" TEXT,

    CONSTRAINT "Mesa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizacionPolitica" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "simboloUrl" TEXT,

    CONSTRAINT "OrganizacionPolitica_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListaCandidatura" (
    "id" TEXT NOT NULL,
    "cargo" "Cargo" NOT NULL,
    "organizacionId" TEXT NOT NULL,
    "provinciaNombre" TEXT NOT NULL DEFAULT '',
    "distritoNombre" TEXT NOT NULL DEFAULT '',
    "orden" INTEGER NOT NULL,
    "expediente" TEXT,
    "jee" TEXT,

    CONSTRAINT "ListaCandidatura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Acta" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "mesaId" TEXT NOT NULL,
    "cargo" "Cargo" NOT NULL,
    "personeroId" TEXT NOT NULL,
    "estado" "EstadoActa" NOT NULL DEFAULT 'ENVIADA',
    "observaciones" TEXT,
    "digitadaEn" TIMESTAMP(3) NOT NULL,
    "sincronizadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Acta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActaResultado" (
    "id" TEXT NOT NULL,
    "actaId" TEXT NOT NULL,
    "listaCandidaturaId" TEXT,
    "tipo" "TipoResultado" NOT NULL,
    "votos" INTEGER NOT NULL,

    CONSTRAINT "ActaResultado_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_dni_key" ON "Usuario"("dni");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Provincia_nombre_key" ON "Provincia"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "Distrito_provinciaId_nombre_key" ON "Distrito"("provinciaId", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "LocalVotacion_codigo_key" ON "LocalVotacion"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Mesa_codigo_key" ON "Mesa"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizacionPolitica_nombre_key" ON "OrganizacionPolitica"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "ListaCandidatura_cargo_provinciaNombre_distritoNombre_organ_key" ON "ListaCandidatura"("cargo", "provinciaNombre", "distritoNombre", "organizacionId");

-- CreateIndex
CREATE UNIQUE INDEX "Acta_clienteId_key" ON "Acta"("clienteId");

-- CreateIndex
CREATE UNIQUE INDEX "Acta_mesaId_cargo_key" ON "Acta"("mesaId", "cargo");

-- CreateIndex
CREATE INDEX "ActaResultado_actaId_idx" ON "ActaResultado"("actaId");

-- AddForeignKey
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_coordinadorId_fkey" FOREIGN KEY ("coordinadorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Distrito" ADD CONSTRAINT "Distrito_provinciaId_fkey" FOREIGN KEY ("provinciaId") REFERENCES "Provincia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalVotacion" ADD CONSTRAINT "LocalVotacion_distritoId_fkey" FOREIGN KEY ("distritoId") REFERENCES "Distrito"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mesa" ADD CONSTRAINT "Mesa_localVotacionId_fkey" FOREIGN KEY ("localVotacionId") REFERENCES "LocalVotacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mesa" ADD CONSTRAINT "Mesa_personeroId_fkey" FOREIGN KEY ("personeroId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListaCandidatura" ADD CONSTRAINT "ListaCandidatura_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "OrganizacionPolitica"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Acta" ADD CONSTRAINT "Acta_mesaId_fkey" FOREIGN KEY ("mesaId") REFERENCES "Mesa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Acta" ADD CONSTRAINT "Acta_personeroId_fkey" FOREIGN KEY ("personeroId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActaResultado" ADD CONSTRAINT "ActaResultado_actaId_fkey" FOREIGN KEY ("actaId") REFERENCES "Acta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActaResultado" ADD CONSTRAINT "ActaResultado_listaCandidaturaId_fkey" FOREIGN KEY ("listaCandidaturaId") REFERENCES "ListaCandidatura"("id") ON DELETE SET NULL ON UPDATE CASCADE;

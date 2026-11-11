import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requiereAuth } from '../lib/auth';
import type { CatalogoDTO } from '@erm2026/shared';
import { vueltaActiva } from '../lib/vuelta';

export const catalogoRouter = Router();
catalogoRouter.use(requiereAuth);

// Catálogo completo (mesas + listas de candidatura) para que la PWA lo descargue
// una vez y quede operativa sin conexión: buscar mesa, ver cédula y digitar el
// acta funcionan enteramente contra este catálogo cacheado en IndexedDB.
catalogoRouter.get('/', async (_req, res) => {
  const mesas = await prisma.mesa.findMany({
    include: { localVotacion: { include: { distrito: { include: { provincia: true } } } } },
  });

  const vuelta = vueltaActiva();
  const listas = await prisma.listaCandidatura.findMany({ where: { vuelta }, include: { organizacion: true } });

  const dto: CatalogoDTO = {
    vuelta,
    mesas: mesas.map((m) => ({
      id: m.id,
      codigo: m.codigo,
      electores: m.electores,
      localVotacion: m.localVotacion.nombre,
      distrito: m.localVotacion.distrito.nombre,
      provincia: m.localVotacion.distrito.provincia.nombre,
      capitalDeProvincia: m.localVotacion.distrito.capitalDeProvincia,
    })),
    listas: listas.map((l) => ({
      id: l.id,
      cargo: l.cargo,
      organizacion: l.organizacion.nombre,
      simboloUrl: l.organizacion.simboloUrl,
      orden: l.orden,
      provinciaNombre: l.provinciaNombre,
      distritoNombre: l.distritoNombre,
      vuelta: l.vuelta,
    })),
  };
  res.json(dto);
});

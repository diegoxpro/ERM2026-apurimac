import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requiereAuth } from '../lib/auth';
import type { CedulaMesaDTO, ColumnaCedulaDTO, Cargo } from '@erm2026/shared';

export const mesasRouter = Router();
mesasRouter.use(requiereAuth);

mesasRouter.get('/buscar', async (req, res) => {
  const codigo = String(req.query.codigo ?? '').trim();
  if (!codigo) return res.status(400).json({ error: 'Parámetro "codigo" requerido' });

  const mesas = await prisma.mesa.findMany({
    where: { codigo: { contains: codigo } },
    include: {
      localVotacion: { include: { distrito: { include: { provincia: true } } } },
      acta: true,
    },
    take: 20,
  });

  res.json(
    mesas.map((m) => ({
      id: m.id,
      codigo: m.codigo,
      electores: m.electores,
      localVotacion: m.localVotacion.nombre,
      distrito: m.localVotacion.distrito.nombre,
      provincia: m.localVotacion.distrito.provincia.nombre,
      digitada: m.acta != null,
    }))
  );
});

mesasRouter.get('/:mesaId/cedula', async (req, res) => {
  const mesa = await prisma.mesa.findUnique({
    where: { id: req.params.mesaId },
    include: { localVotacion: { include: { distrito: { include: { provincia: true } } } } },
  });
  if (!mesa) return res.status(404).json({ error: 'Mesa no encontrada' });

  const distrito = mesa.localVotacion.distrito;
  const provincia = distrito.provincia;

  const columnasDef: { cargo: Cargo; titulo: string; where: any }[] = [
    {
      cargo: 'GOBERNADOR_REGIONAL',
      titulo: 'GOBERNADOR Y VICEGOBERNADOR REGIONAL',
      where: { cargo: 'GOBERNADOR_REGIONAL', provinciaNombre: '', distritoNombre: '' },
    },
    {
      cargo: 'CONSEJERO_REGIONAL',
      titulo: `CONSEJERO REGIONAL PROVINCIA DE ${provincia.nombre}`,
      where: { cargo: 'CONSEJERO_REGIONAL', provinciaNombre: provincia.nombre, distritoNombre: '' },
    },
    {
      cargo: 'ALCALDE_PROVINCIAL',
      titulo: `PROVINCIA DE ${provincia.nombre}`,
      where: { cargo: 'ALCALDE_PROVINCIAL', provinciaNombre: provincia.nombre, distritoNombre: '' },
    },
  ];
  if (!distrito.capitalDeProvincia) {
    columnasDef.push({
      cargo: 'ALCALDE_DISTRITAL',
      titulo: `DISTRITO DE ${distrito.nombre}`,
      where: { cargo: 'ALCALDE_DISTRITAL', provinciaNombre: provincia.nombre, distritoNombre: distrito.nombre },
    });
  }

  const columnas: ColumnaCedulaDTO[] = [];
  for (const def of columnasDef) {
    const listas = await prisma.listaCandidatura.findMany({
      where: def.where,
      include: { organizacion: true },
      orderBy: { orden: 'asc' },
    });
    columnas.push({
      cargo: def.cargo,
      titulo: def.titulo,
      listas: listas.map((l) => ({
        id: l.id,
        cargo: def.cargo,
        organizacion: l.organizacion.nombre,
        simboloUrl: l.organizacion.simboloUrl,
        orden: l.orden,
      })),
    });
  }

  const dto: CedulaMesaDTO = {
    mesaId: mesa.id,
    mesaCodigo: mesa.codigo,
    provincia: provincia.nombre,
    distrito: distrito.nombre,
    localVotacion: mesa.localVotacion.nombre,
    electoresHabiles: mesa.electores,
    columnas,
  };
  res.json(dto);
});

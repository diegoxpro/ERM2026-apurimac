import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requiereAuth } from '../lib/auth';
import type { LocalDTO } from '@erm2026/shared';

export const localesRouter = Router();
localesRouter.use(requiereAuth);

localesRouter.get('/geo', async (_req, res) => {
  const provincias = await prisma.provincia.findMany({
    include: { distritos: { orderBy: { nombre: 'asc' } } },
    orderBy: { nombre: 'asc' },
  });
  res.json(
    provincias.map((p) => ({
      nombre: p.nombre,
      distritos: p.distritos.map((d) => ({ nombre: d.nombre, capitalDeProvincia: d.capitalDeProvincia })),
    }))
  );
});

localesRouter.get('/', async (req, res) => {
  const search = String(req.query.search ?? '').trim();
  const provincia = req.query.provincia ? String(req.query.provincia) : undefined;

  const where: any = {};
  if (search) {
    where.OR = [
      { nombre: { contains: search, mode: 'insensitive' } },
      { direccion: { contains: search, mode: 'insensitive' } },
    ];
  }
  if (provincia) where.distrito = { provincia: { nombre: provincia } };

  const locales = await prisma.localVotacion.findMany({
    where,
    include: { distrito: { include: { provincia: true } }, _count: { select: { mesas: true } } },
    orderBy: { nombre: 'asc' },
  });

  const dto: LocalDTO[] = locales.map((l) => ({
    id: l.id,
    codigo: l.codigo,
    nombre: l.nombre,
    direccion: l.direccion,
    distrito: l.distrito.nombre,
    provincia: l.distrito.provincia.nombre,
    totalMesas: l._count.mesas,
  }));
  res.json(dto);
});

const crearLocalSchema = z.object({
  codigo: z.string().min(1),
  nombre: z.string().min(1),
  direccion: z.string().optional(),
  provincia: z.string().min(1),
  distrito: z.string().min(1),
});

localesRouter.post('/', async (req, res) => {
  if (!['ADMIN', 'COORDINADOR'].includes(req.usuario!.rol)) {
    return res.status(403).json({ error: 'No tienes permiso para crear locales' });
  }
  const parsed = crearLocalSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Datos inválidos', detalle: parsed.error.flatten() });

  const provincia = await prisma.provincia.findUnique({ where: { nombre: parsed.data.provincia } });
  if (!provincia) return res.status(404).json({ error: 'Provincia no encontrada' });
  const distrito = await prisma.distrito.findUnique({
    where: { provinciaId_nombre: { provinciaId: provincia.id, nombre: parsed.data.distrito } },
  });
  if (!distrito) return res.status(404).json({ error: 'Distrito no encontrado' });

  const local = await prisma.localVotacion.create({
    data: {
      codigo: parsed.data.codigo,
      nombre: parsed.data.nombre,
      direccion: parsed.data.direccion,
      distritoId: distrito.id,
    },
  });
  res.status(201).json({ id: local.id });
});

const actualizarLocalSchema = z.object({
  nombre: z.string().min(1).optional(),
  direccion: z.string().optional(),
});

localesRouter.put('/:localId', async (req, res) => {
  if (!['ADMIN', 'COORDINADOR'].includes(req.usuario!.rol)) {
    return res.status(403).json({ error: 'No tienes permiso para editar locales' });
  }
  const parsed = actualizarLocalSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Datos inválidos' });
  const local = await prisma.localVotacion.update({ where: { id: req.params.localId }, data: parsed.data });
  res.json({ id: local.id });
});

localesRouter.delete('/:localId', async (req, res) => {
  if (!['ADMIN', 'COORDINADOR'].includes(req.usuario!.rol)) {
    return res.status(403).json({ error: 'No tienes permiso para eliminar locales' });
  }
  const mesas = await prisma.mesa.count({ where: { localVotacionId: req.params.localId } });
  if (mesas > 0) {
    return res.status(409).json({ error: 'No se puede eliminar un local que todavía tiene mesas' });
  }
  await prisma.localVotacion.delete({ where: { id: req.params.localId } });
  res.status(204).end();
});

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requiereAuth } from '../lib/auth';
import type { CedulaMesaDTO, ColumnaCedulaDTO, Cargo, EstadoCargoMesa } from '@erm2026/shared';

export const mesasRouter = Router();
mesasRouter.use(requiereAuth);

function totalCargosDeMesa(capitalDeProvincia: boolean): number {
  return capitalDeProvincia ? 3 : 4;
}

// Listado de mesas con filtros, usado por "Llenar actas" y por "Locales y mesas".
mesasRouter.get('/', async (req, res) => {
  const search = String(req.query.search ?? '').trim();
  const provincia = req.query.provincia ? String(req.query.provincia) : undefined;
  const distrito = req.query.distrito ? String(req.query.distrito) : undefined;
  const localVotacionId = req.query.localId ? String(req.query.localId) : undefined;
  const soloPropias = req.query.mine === 'true';
  const limit = Math.min(parseInt(String(req.query.limit ?? '50'), 10) || 50, 500);
  const offset = parseInt(String(req.query.offset ?? '0'), 10) || 0;

  const where: any = {};
  if (soloPropias) where.personeroId = req.usuario!.sub;
  if (search) {
    where.OR = [
      { codigo: { contains: search } },
      { localVotacion: { nombre: { contains: search, mode: 'insensitive' } } },
    ];
  }
  if (localVotacionId) where.localVotacionId = localVotacionId;
  if (provincia || distrito) {
    const distritoWhere: any = {};
    if (provincia) distritoWhere.provincia = { nombre: provincia };
    if (distrito) distritoWhere.nombre = distrito;
    where.localVotacion = { distrito: distritoWhere };
  }

  const [total, mesas] = await Promise.all([
    prisma.mesa.count({ where }),
    prisma.mesa.findMany({
      where,
      include: {
        localVotacion: { include: { distrito: { include: { provincia: true } } } },
        personero: true,
        actas: true,
      },
      orderBy: { codigo: 'asc' },
      take: limit,
      skip: offset,
    }),
  ]);

  res.json({
    total,
    items: mesas.map((m) => {
      const totalCargos = totalCargosDeMesa(m.localVotacion.distrito.capitalDeProvincia);
      return {
        id: m.id,
        codigo: m.codigo,
        electores: m.electores,
        electoresDiscapacidad: m.electoresDiscapacidad,
        localVotacion: m.localVotacion.nombre,
        distrito: m.localVotacion.distrito.nombre,
        provincia: m.localVotacion.distrito.provincia.nombre,
        personeroId: m.personeroId,
        personeroNombre: m.personero?.nombre ?? null,
        actasRegistradas: m.actas.length,
        actasEsperadas: totalCargos,
      };
    }),
  });
});

const crearMesaSchema = z.object({
  codigo: z.string().min(1),
  electores: z.number().int().min(0),
  electoresDiscapacidad: z.number().int().min(0).optional(),
  personeroId: z.string().nullable().optional(),
});

mesasRouter.post('/', async (req, res) => {
  if (!['ADMIN', 'COORDINADOR'].includes(req.usuario!.rol)) {
    return res.status(403).json({ error: 'No tienes permiso para crear mesas' });
  }
  const localVotacionId = String(req.body.localVotacionId ?? '');
  const parsed = crearMesaSchema.safeParse(req.body);
  if (!localVotacionId || !parsed.success) {
    return res.status(400).json({ error: 'Datos de mesa inválidos' });
  }
  const local = await prisma.localVotacion.findUnique({ where: { id: localVotacionId } });
  if (!local) return res.status(404).json({ error: 'Local de votación no encontrado' });

  const mesa = await prisma.mesa.create({
    data: {
      codigo: parsed.data.codigo,
      electores: parsed.data.electores,
      electoresDiscapacidad: parsed.data.electoresDiscapacidad ?? 0,
      personeroId: parsed.data.personeroId ?? null,
      localVotacionId,
    },
  });
  res.status(201).json({ id: mesa.id });
});

const actualizarMesaSchema = z.object({
  codigo: z.string().min(1).optional(),
  electores: z.number().int().min(0).optional(),
  electoresDiscapacidad: z.number().int().min(0).optional(),
  personeroId: z.string().nullable().optional(),
});

mesasRouter.put('/:mesaId', async (req, res) => {
  if (!['ADMIN', 'COORDINADOR'].includes(req.usuario!.rol)) {
    return res.status(403).json({ error: 'No tienes permiso para editar mesas' });
  }
  const parsed = actualizarMesaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Datos inválidos' });

  const mesa = await prisma.mesa.update({ where: { id: req.params.mesaId }, data: parsed.data });
  res.json({ id: mesa.id });
});

mesasRouter.delete('/:mesaId', async (req, res) => {
  if (!['ADMIN', 'COORDINADOR'].includes(req.usuario!.rol)) {
    return res.status(403).json({ error: 'No tienes permiso para eliminar mesas' });
  }
  const actas = await prisma.acta.count({ where: { mesaId: req.params.mesaId } });
  if (actas > 0) {
    return res.status(409).json({ error: 'No se puede eliminar una mesa que ya tiene actas registradas' });
  }
  await prisma.mesa.delete({ where: { id: req.params.mesaId } });
  res.status(204).end();
});

mesasRouter.get('/:mesaId/cedula', async (req, res) => {
  const mesa = await prisma.mesa.findUnique({
    where: { id: req.params.mesaId },
    include: { localVotacion: { include: { distrito: { include: { provincia: true } } } } },
  });
  if (!mesa) return res.status(404).json({ error: 'Mesa no encontrada' });

  const distrito = mesa.localVotacion.distrito;
  const provincia = distrito.provincia;

  const actasExistentes = await prisma.acta.findMany({ where: { mesaId: mesa.id } });
  const actaPorCargo = new Map(actasExistentes.map((a) => [a.cargo, a]));

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
    const acta = actaPorCargo.get(def.cargo);
    const estado: EstadoCargoMesa = acta ? acta.estado : 'SIN_REGISTRAR';
    columnas.push({
      cargo: def.cargo,
      titulo: def.titulo,
      estado,
      actaId: acta?.id ?? null,
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

// Resultados ya guardados para un cargo de una mesa (para poder editar/ver el detalle).
mesasRouter.get('/:mesaId/actas/:cargo', async (req, res) => {
  const acta = await prisma.acta.findUnique({
    where: { mesaId_cargo: { mesaId: req.params.mesaId, cargo: req.params.cargo as Cargo } },
    include: { resultados: true, personero: true },
  });
  if (!acta) return res.status(404).json({ error: 'No hay acta registrada para ese cargo' });
  res.json({
    id: acta.id,
    estado: acta.estado,
    digitadaEn: acta.digitadaEn,
    personeroNombre: acta.personero.nombre,
    resultados: acta.resultados.map((r) => ({ listaCandidaturaId: r.listaCandidaturaId, tipo: r.tipo, votos: r.votos })),
  });
});

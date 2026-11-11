import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requiereAuth } from '../lib/auth';
import type { ActaResumenDTO, ActaSyncResult, Cargo } from '@erm2026/shared';
import type { Server as SocketIOServer } from 'socket.io';
import { vueltaActiva, vueltaDeQuery } from '../lib/vuelta';

const resultadoSchema = z.object({
  listaCandidaturaId: z.string().nullable(),
  tipo: z.enum(['VOTO_LISTA', 'BLANCO', 'NULO', 'IMPUGNADO']),
  votos: z.number().int().min(0),
});

const syncSchema = z.object({
  clienteId: z.string().min(1),
  mesaId: z.string().min(1),
  cargo: z.enum(['GOBERNADOR_REGIONAL', 'CONSEJERO_REGIONAL', 'ALCALDE_PROVINCIAL', 'ALCALDE_DISTRITAL']),
  vuelta: z.enum(['PRIMERA', 'SEGUNDA']).optional(),
  resultados: z.array(resultadoSchema).min(1),
  observaciones: z.string().optional(),
  fotoBase64: z.string().optional(),
  digitadaEn: z.string(),
});

export function buildActasRouter(io: SocketIOServer) {
  const router = Router();
  router.use(requiereAuth);

  router.post('/sync', async (req, res) => {
    const parsed = syncSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Datos de acta inválidos', detalle: parsed.error.flatten() });
    }
    const input = parsed.data;
    const personeroId = req.usuario!.sub;

    const existente = await prisma.acta.findUnique({ where: { clienteId: input.clienteId } });
    if (existente) {
      const result: ActaSyncResult = { clienteId: input.clienteId, actaId: existente.id, estado: existente.estado };
      return res.json(result);
    }

    // Solo se reciben actas de la vuelta activa: evita que una acta guardada
    // offline en otra vuelta se mezcle con el conteo en curso.
    const vuelta = vueltaActiva();
    if ((input.vuelta ?? vuelta) !== vuelta) {
      return res.status(422).json({
        error: `Esta acta es de la ${input.vuelta === 'SEGUNDA' ? 'segunda' : 'primera'} vuelta, pero el sistema está recibiendo actas de la ${vuelta === 'SEGUNDA' ? 'segunda' : 'primera'} vuelta`,
      });
    }
    if (vuelta === 'SEGUNDA' && input.cargo !== 'GOBERNADOR_REGIONAL') {
      return res.status(422).json({ error: 'En segunda vuelta solo se registra Gobernador y Vicegobernador Regional' });
    }

    const mesa = await prisma.mesa.findUnique({ where: { id: input.mesaId } });
    if (!mesa) return res.status(404).json({ error: 'Mesa no encontrada' });

    // Los votos por lista deben apuntar a listas de este cargo y de esta vuelta.
    const idsListas = [...new Set(input.resultados.map((r) => r.listaCandidaturaId).filter((id): id is string => !!id))];
    if (idsListas.length > 0) {
      const validas = await prisma.listaCandidatura.count({ where: { id: { in: idsListas }, cargo: input.cargo, vuelta } });
      if (validas !== idsListas.length) {
        return res.status(422).json({ error: 'El acta incluye organizaciones que no corresponden a este cargo o a esta vuelta' });
      }
    }

    const yaRegistrada = await prisma.acta.findUnique({
      where: { mesaId_cargo_vuelta: { mesaId: input.mesaId, cargo: input.cargo, vuelta } },
    });
    if (yaRegistrada) {
      return res
        .status(409)
        .json({ error: 'Este cargo ya tiene un acta registrada para esta mesa', actaId: yaRegistrada.id, estado: yaRegistrada.estado });
    }

    const acta = await prisma.acta.create({
      data: {
        clienteId: input.clienteId,
        mesaId: input.mesaId,
        cargo: input.cargo,
        vuelta,
        personeroId,
        estado: 'ENVIADA',
        observaciones: input.observaciones,
        fotoBase64: input.fotoBase64,
        digitadaEn: new Date(input.digitadaEn),
        resultados: {
          create: input.resultados.map((r) => ({
            tipo: r.tipo,
            votos: r.votos,
            listaCandidaturaId: r.listaCandidaturaId,
          })),
        },
      },
    });

    io.emit('acta:sincronizada', { mesaId: mesa.id, cargo: input.cargo, actaId: acta.id });

    const result: ActaSyncResult = { clienteId: input.clienteId, actaId: acta.id, estado: acta.estado };
    res.status(201).json(result);
  });

  // Listado de actas ya enviadas por los personeros, para revisión en el panel admin.
  router.get('/', async (req, res) => {
    if (!['ADMIN', 'COORDINADOR'].includes(req.usuario!.rol)) {
      return res.status(403).json({ error: 'No tienes permiso para ver las actas' });
    }
    const search = String(req.query.search ?? '').trim();
    const cargo = req.query.cargo ? (String(req.query.cargo) as Cargo) : undefined;
    const estado = req.query.estado ? String(req.query.estado) : undefined;
    const limit = Math.min(parseInt(String(req.query.limit ?? '50'), 10) || 50, 200);
    const offset = parseInt(String(req.query.offset ?? '0'), 10) || 0;

    const where: any = { vuelta: vueltaDeQuery(req.query.vuelta) };
    if (req.usuario!.rol === 'COORDINADOR') where.personero = { coordinadorId: req.usuario!.sub };
    if (cargo) where.cargo = cargo;
    if (estado) where.estado = estado;
    if (search) where.mesa = { codigo: { contains: search } };

    const [total, actas] = await Promise.all([
      prisma.acta.count({ where }),
      prisma.acta.findMany({
        where,
        include: { mesa: { include: { localVotacion: { include: { distrito: { include: { provincia: true } } } } } }, personero: true },
        orderBy: { sincronizadaEn: 'desc' },
        take: limit,
        skip: offset,
      }),
    ]);

    const items: ActaResumenDTO[] = actas.map((a) => ({
      id: a.id,
      mesaId: a.mesaId,
      mesaCodigo: a.mesa.codigo,
      cargo: a.cargo,
      vuelta: a.vuelta,
      localVotacion: a.mesa.localVotacion.nombre,
      distrito: a.mesa.localVotacion.distrito.nombre,
      provincia: a.mesa.localVotacion.distrito.provincia.nombre,
      personeroNombre: a.personero.nombre,
      estado: a.estado,
      digitadaEn: a.digitadaEn.toISOString(),
      electoresHabiles: a.mesa.electores,
      tieneFoto: !!a.fotoBase64,
    }));

    res.json({ total, items });
  });

  router.post('/:actaId/validar', async (req, res) => {
    if (!['ADMIN', 'COORDINADOR'].includes(req.usuario!.rol)) {
      return res.status(403).json({ error: 'No tienes permiso para validar actas' });
    }
    const acta = await prisma.acta.update({
      where: { id: req.params.actaId },
      data: { estado: 'VALIDADA' },
    });
    io.emit('acta:sincronizada', { mesaId: acta.mesaId, cargo: acta.cargo, actaId: acta.id });
    res.json({ id: acta.id, estado: acta.estado });
  });

  return router;
}

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requiereAuth } from '../lib/auth';
import type { ActaSyncResult } from '@erm2026/shared';
import type { Server as SocketIOServer } from 'socket.io';

const resultadoSchema = z.object({
  cargo: z.enum(['GOBERNADOR_REGIONAL', 'CONSEJERO_REGIONAL', 'ALCALDE_PROVINCIAL', 'ALCALDE_DISTRITAL']),
  listaCandidaturaId: z.string().nullable(),
  tipo: z.enum(['VOTO_LISTA', 'BLANCO', 'NULO', 'IMPUGNADO']),
  votos: z.number().int().min(0),
});

const syncSchema = z.object({
  clienteId: z.string().min(1),
  mesaId: z.string().min(1),
  resultados: z.array(resultadoSchema).min(1),
  observaciones: z.string().optional(),
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
    const digitadorId = req.usuario!.sub;

    const existente = await prisma.acta.findUnique({ where: { clienteId: input.clienteId } });
    if (existente) {
      const result: ActaSyncResult = { clienteId: input.clienteId, actaId: existente.id, estado: existente.estado };
      return res.json(result);
    }

    const mesa = await prisma.mesa.findUnique({ where: { id: input.mesaId } });
    if (!mesa) return res.status(404).json({ error: 'Mesa no encontrada' });

    const yaDigitada = await prisma.acta.findUnique({ where: { mesaId: input.mesaId } });
    if (yaDigitada) {
      return res.status(409).json({ error: 'Esta mesa ya tiene un acta digitada', actaId: yaDigitada.id });
    }

    const acta = await prisma.acta.create({
      data: {
        clienteId: input.clienteId,
        mesaId: input.mesaId,
        digitadorId,
        estado: 'DIGITADA',
        observaciones: input.observaciones,
        digitadaEn: new Date(input.digitadaEn),
        resultados: {
          create: input.resultados.map((r) => ({
            tipo: r.tipo,
            votos: r.votos,
            listaCandidaturaId: r.listaCandidaturaId,
            cargo: r.cargo,
          })),
        },
      },
    });

    io.emit('acta:sincronizada', { mesaId: mesa.id, actaId: acta.id });

    const result: ActaSyncResult = { clienteId: input.clienteId, actaId: acta.id, estado: acta.estado };
    res.status(201).json(result);
  });

  return router;
}

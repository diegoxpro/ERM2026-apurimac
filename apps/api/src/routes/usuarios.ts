import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requiereAuth, requiereRol } from '../lib/auth';
import type { UsuarioDTO } from '@erm2026/shared';

export const usuariosRouter = Router();
usuariosRouter.use(requiereAuth, requiereRol('ADMIN', 'COORDINADOR'));

function aDTO(u: {
  id: string;
  nombre: string;
  dni: string;
  email: string | null;
  telefono: string | null;
  rol: 'ADMIN' | 'COORDINADOR' | 'PERSONERO';
  activo: boolean;
  coordinadorId: string | null;
  coordinador: { nombre: string } | null;
  createdAt: Date;
}): UsuarioDTO {
  return {
    id: u.id,
    nombre: u.nombre,
    dni: u.dni,
    email: u.email,
    telefono: u.telefono,
    rol: u.rol,
    activo: u.activo,
    coordinadorId: u.coordinadorId,
    coordinadorNombre: u.coordinador?.nombre ?? null,
    createdAt: u.createdAt.toISOString(),
  };
}

usuariosRouter.get('/', async (req, res) => {
  const search = String(req.query.search ?? '').trim();
  const rol = req.query.rol ? String(req.query.rol) : undefined;
  const estado = req.query.estado ? String(req.query.estado) : undefined; // 'activo' | 'inactivo'

  const where: any = {};
  if (req.usuario!.rol === 'COORDINADOR') {
    // Un coordinador solo administra a sus propios personeros (y se ve a sí mismo).
    where.OR = [{ id: req.usuario!.sub }, { coordinadorId: req.usuario!.sub }];
  }
  if (search) {
    where.AND = [
      ...(where.AND ?? []),
      {
        OR: [
          { nombre: { contains: search, mode: 'insensitive' } },
          { dni: { contains: search } },
          { email: { contains: search, mode: 'insensitive' } },
        ],
      },
    ];
  }
  if (rol) where.rol = rol;
  if (estado) where.activo = estado === 'activo';

  const usuarios = await prisma.usuario.findMany({
    where,
    include: { coordinador: { select: { nombre: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json(usuarios.map(aDTO));
});

const crearUsuarioSchema = z.object({
  nombre: z.string().min(1),
  dni: z.string().min(1),
  email: z.string().email().optional(),
  telefono: z.string().optional(),
  rol: z.enum(['ADMIN', 'COORDINADOR', 'PERSONERO']),
  password: z.string().min(6),
  coordinadorId: z.string().nullable().optional(),
});

usuariosRouter.post('/', async (req, res) => {
  const parsed = crearUsuarioSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Datos inválidos', detalle: parsed.error.flatten() });
  const input = parsed.data;

  if (req.usuario!.rol === 'COORDINADOR') {
    if (input.rol !== 'PERSONERO') {
      return res.status(403).json({ error: 'Un coordinador solo puede crear personeros' });
    }
    input.coordinadorId = req.usuario!.sub;
  }
  if (input.rol === 'PERSONERO' && !input.coordinadorId) {
    return res.status(400).json({ error: 'Un personero debe tener un coordinador asignado' });
  }

  const existente = await prisma.usuario.findUnique({ where: { dni: input.dni } });
  if (existente) return res.status(409).json({ error: 'Ya existe un usuario con ese DNI' });

  const passwordHash = await bcrypt.hash(input.password, 10);
  const usuario = await prisma.usuario.create({
    data: {
      nombre: input.nombre,
      dni: input.dni,
      email: input.email,
      telefono: input.telefono,
      rol: input.rol,
      passwordHash,
      coordinadorId: input.rol === 'PERSONERO' ? input.coordinadorId : null,
    },
    include: { coordinador: { select: { nombre: true } } },
  });
  res.status(201).json(aDTO(usuario));
});

const actualizarUsuarioSchema = z.object({
  nombre: z.string().min(1).optional(),
  email: z.string().email().optional(),
  telefono: z.string().optional(),
  activo: z.boolean().optional(),
  coordinadorId: z.string().nullable().optional(),
  password: z.string().min(6).optional(),
});

async function puedeGestionar(req: import('express').Request, usuarioId: string): Promise<boolean> {
  if (req.usuario!.rol === 'ADMIN') return true;
  const objetivo = await prisma.usuario.findUnique({ where: { id: usuarioId } });
  return objetivo?.coordinadorId === req.usuario!.sub;
}

usuariosRouter.put('/:usuarioId', async (req, res) => {
  if (!(await puedeGestionar(req, req.params.usuarioId))) {
    return res.status(403).json({ error: 'No tienes permiso para editar este usuario' });
  }
  const parsed = actualizarUsuarioSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Datos inválidos' });

  const { password, ...resto } = parsed.data;
  const data: any = { ...resto };
  if (password) data.passwordHash = await bcrypt.hash(password, 10);

  const usuario = await prisma.usuario.update({
    where: { id: req.params.usuarioId },
    data,
    include: { coordinador: { select: { nombre: true } } },
  });
  res.json(aDTO(usuario));
});

usuariosRouter.post('/:usuarioId/revocar', async (req, res) => {
  if (!(await puedeGestionar(req, req.params.usuarioId))) {
    return res.status(403).json({ error: 'No tienes permiso para revocar este usuario' });
  }
  const usuario = await prisma.usuario.update({ where: { id: req.params.usuarioId }, data: { activo: false } });
  res.json({ id: usuario.id, activo: usuario.activo });
});

usuariosRouter.post('/:usuarioId/reactivar', async (req, res) => {
  if (!(await puedeGestionar(req, req.params.usuarioId))) {
    return res.status(403).json({ error: 'No tienes permiso para reactivar este usuario' });
  }
  const usuario = await prisma.usuario.update({ where: { id: req.params.usuarioId }, data: { activo: true } });
  res.json({ id: usuario.id, activo: usuario.activo });
});

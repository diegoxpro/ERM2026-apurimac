import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { analizarArchivo, ejecutarImportacion, aDTO as aDTOImportacion } from '../lib/importarUsuarios';
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

// Carga masiva desde Excel. Con confirmar=false solo valida y devuelve la vista
// previa; con confirmar=true vuelve a validar el mismo archivo y lo aplica.
usuariosRouter.post('/importar', async (req, res) => {
  const archivoBase64 = typeof req.body?.archivoBase64 === 'string' ? req.body.archivoBase64 : '';
  if (!archivoBase64) return res.status(400).json({ error: 'Adjunta el archivo Excel' });
  try {
    const filas = await analizarArchivo(Buffer.from(archivoBase64, 'base64'), req.usuario!);
    if (req.body.confirmar !== true) return res.json({ filas: aDTOImportacion(filas) });
    const resultado = await ejecutarImportacion(filas, req.usuario!);
    res.json({ filas: aDTOImportacion(filas), resultado });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'No se pudo procesar el archivo' });
  }
});

const crearUsuarioSchema = z.object({
  nombre: z.string().min(1),
  dni: z.string().min(1),
  email: z.string().email().optional(),
  telefono: z.string().optional(),
  rol: z.enum(['ADMIN', 'COORDINADOR', 'PERSONERO']),
  // Los personeros entran solo con DNI; para ellos la contraseña es opcional.
  password: z.string().min(6).optional(),
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

  if (!input.password && input.rol !== 'PERSONERO') {
    return res.status(400).json({ error: 'La contraseña es obligatoria para administradores y coordinadores' });
  }
  // Sin contraseña se guarda un hash de un valor aleatorio: nadie puede usarla en /login.
  const passwordHash = await bcrypt.hash(input.password ?? randomBytes(32).toString('hex'), 10);
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

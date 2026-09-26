import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { firmarToken } from '../lib/auth';

export const authRouter = Router();

const loginSchema = z.object({
  dni: z.string().min(1),
  password: z.string().min(1),
});

authRouter.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'DNI y contraseña son requeridos' });
  }
  const { dni, password } = parsed.data;

  const usuario = await prisma.usuario.findUnique({ where: { dni } });
  if (!usuario || !usuario.activo) {
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }

  const passwordOk = await bcrypt.compare(password, usuario.passwordHash);
  if (!passwordOk) {
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }

  const token = firmarToken({ sub: usuario.id, nombre: usuario.nombre, rol: usuario.rol });
  res.json({
    token,
    usuario: { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol },
  });
});

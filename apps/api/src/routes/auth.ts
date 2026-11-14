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

// Los DNI no son secretos: se limitan los intentos FALLIDOS por IP para frenar
// que alguien pruebe DNIs al azar. Los ingresos correctos no cuentan, así varios
// personeros en el mismo local (misma IP) no se bloquean entre sí. El umbral es
// holgado porque muchos celulares comparten IP (CGNAT del operador, wifi del
// colegio); aun así, ~4.000 intentos/día por IP no sirven para adivinar DNIs.
const MAX_FALLOS = 30;
const VENTANA_MS = 10 * 60 * 1000;
const fallosPorIp = new Map<string, { n: number; desde: number }>();

function bloqueado(ip: string): boolean {
  const f = fallosPorIp.get(ip);
  if (!f) return false;
  if (Date.now() - f.desde > VENTANA_MS) {
    fallosPorIp.delete(ip);
    return false;
  }
  return f.n >= MAX_FALLOS;
}

function registrarFallo(ip: string) {
  const f = fallosPorIp.get(ip);
  if (!f || Date.now() - f.desde > VENTANA_MS) fallosPorIp.set(ip, { n: 1, desde: Date.now() });
  else f.n++;
}

// Ingreso de personeros solo con DNI (sin contraseña). Únicamente para cuentas
// PERSONERO activas; administradores y coordinadores siguen usando /login.
authRouter.post('/login-personero', async (req, res) => {
  const ip = req.ip ?? 'desconocida';
  if (bloqueado(ip)) {
    return res.status(429).json({ error: 'Demasiados intentos fallidos. Espera unos minutos e inténtalo de nuevo.' });
  }
  const dni = String(req.body?.dni ?? '').trim();
  if (!/^\d{8}$/.test(dni)) {
    return res.status(400).json({ error: 'Ingresa un DNI válido de 8 dígitos' });
  }

  const usuario = await prisma.usuario.findUnique({ where: { dni } });
  if (!usuario || !usuario.activo || usuario.rol !== 'PERSONERO') {
    registrarFallo(ip);
    return res.status(401).json({ error: 'Este DNI no está registrado como personero. Consulta con tu coordinador.' });
  }

  const token = firmarToken({ sub: usuario.id, nombre: usuario.nombre, rol: usuario.rol });
  res.json({
    token,
    usuario: { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol },
  });
});

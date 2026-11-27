import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import type { RolUsuario } from '@erm2026/shared';
import { prisma } from './prisma';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET no está definido en el entorno');
}

export interface AuthPayload {
  sub: string;
  nombre: string;
  rol: RolUsuario;
}

// Duración de la sesión (panel y personeros). Por defecto NO vence, para que
// nadie quede fuera en pleno conteo. Se puede fijar con JWT_EXPIRES_IN (p. ej.
// "24h", "7d"). Para cerrar TODAS las sesiones de golpe, cambia JWT_SECRET.
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN?.trim();

export function firmarToken(payload: AuthPayload): string {
  const opciones: jwt.SignOptions = JWT_EXPIRES_IN
    ? { expiresIn: JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] }
    : {};
  return jwt.sign(payload, JWT_SECRET as string, opciones);
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      usuario?: AuthPayload;
    }
  }
}

export async function requiereAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token no proporcionado' });
  }
  let payload: AuthPayload;
  try {
    payload = jwt.verify(header.slice('Bearer '.length), JWT_SECRET as string) as AuthPayload;
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
  // Como el token no vence, se confirma en cada pedido que el usuario siga
  // existiendo y activo: desactivarlo o borrarlo en el panel le corta el acceso
  // al instante, y un cambio de rol se aplica sin volver a ingresar.
  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.sub },
      select: { activo: true, rol: true, nombre: true },
    });
    if (!usuario || !usuario.activo) {
      return res.status(401).json({ error: 'Usuario desactivado o inexistente' });
    }
    req.usuario = { sub: payload.sub, nombre: usuario.nombre, rol: usuario.rol as RolUsuario };
    next();
  } catch (e) {
    next(e);
  }
}

export function requiereRol(...roles: RolUsuario[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.usuario || !roles.includes(req.usuario.rol)) {
      return res.status(403).json({ error: 'No tienes permiso para esta acción' });
    }
    next();
  };
}

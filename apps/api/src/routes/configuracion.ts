import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { spawn } from 'child_process';
import { createGzip } from 'zlib';
import { createReadStream, createWriteStream, promises as fs } from 'fs';
import path from 'path';
import { requiereAuth } from '../lib/auth';
import { guardarConfigLector, MODELOS_LECTOR, obtenerConfigLector } from '../lib/configuracion';
import { clienteAnthropic } from '../lib/lectorActas';
import type { BackupDTO, ConfigLectorDTO } from '@erm2026/shared';

// Menú "Configuración" del panel: respaldos de la base y lectura con IA.
// Solo para el administrador global.

export const configuracionRouter = Router();
configuracionRouter.use(requiereAuth);
configuracionRouter.use((req: Request, res: Response, next: NextFunction) => {
  if (req.usuario!.rol !== 'ADMIN') return res.status(403).json({ error: 'Solo el administrador puede ver la configuración' });
  next();
});

// ---------- Lectura con IA ----------

async function dtoLector(): Promise<ConfigLectorDTO> {
  const cfg = await obtenerConfigLector();
  return {
    activo: cfg.activo,
    modelo: cfg.modelo,
    modelos: MODELOS_LECTOR.map((m) => ({ ...m })),
    tieneApiKey: !!cfg.apiKey,
    apiKeyFinal: cfg.apiKey ? cfg.apiKey.slice(-4) : null,
    origenClave: cfg.origenClave,
  };
}

configuracionRouter.get('/lector', async (_req, res) => {
  res.json(await dtoLector());
});

const lectorSchema = z.object({
  activo: z.boolean().optional(),
  modelo: z.enum(MODELOS_LECTOR.map((m) => m.id) as [string, ...string[]]).optional(),
  // '' o null borra la clave guardada en el panel (vuelve a la del servidor, si hay).
  apiKey: z.string().trim().max(300).nullable().optional(),
});

configuracionRouter.put('/lector', async (req, res) => {
  const parsed = lectorSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Datos inválidos' });
  const { apiKey, ...resto } = parsed.data;
  if (apiKey && !apiKey.startsWith('sk-ant-')) {
    return res.status(400).json({ error: 'La clave de Anthropic debe empezar con "sk-ant-"' });
  }
  await guardarConfigLector({ ...resto, ...(apiKey !== undefined ? { apiKey: apiKey || null } : {}) });
  res.json(await dtoLector());
});

// Verifica la clave y el modelo sin gastar: consultar un modelo no consume tokens.
configuracionRouter.post('/lector/probar', async (_req, res) => {
  const cfg = await obtenerConfigLector();
  if (!cfg.apiKey) return res.status(400).json({ ok: false, error: 'No hay una clave de Anthropic configurada' });
  try {
    const modelo = await clienteAnthropic(cfg.apiKey).models.retrieve(cfg.modelo);
    res.json({ ok: true, mensaje: `Conexión correcta con ${modelo.display_name}.` });
  } catch (e: any) {
    const status = e?.status;
    const error =
      status === 401
        ? 'La clave de Anthropic no es válida'
        : status === 404
        ? 'Tu cuenta de Anthropic no tiene acceso a ese modelo'
        : 'No se pudo conectar con Anthropic';
    res.json({ ok: false, error });
  }
});

// ---------- Respaldos ----------

// En producción es /var/backups/erm2026 del servidor, montado en el contenedor:
// los mismos archivos que crea el cron horario de deploy/backup-db.sh.
const BACKUP_DIR = process.env.BACKUP_DIR || '/backups';
const NOMBRE_VALIDO = /^erm2026-\d{8}-\d{6}\.sql\.gz$/;

configuracionRouter.get('/backups', async (_req, res) => {
  let nombres: string[] = [];
  try {
    nombres = (await fs.readdir(BACKUP_DIR)).filter((n) => NOMBRE_VALIDO.test(n));
  } catch {
    return res.json({ disponible: false, items: [] });
  }
  const items: BackupDTO[] = await Promise.all(
    nombres.map(async (nombre) => {
      const st = await fs.stat(path.join(BACKUP_DIR, nombre));
      return { nombre, bytes: st.size, creadoEn: st.mtime.toISOString() };
    }),
  );
  items.sort((a, b) => b.creadoEn.localeCompare(a.creadoEn));
  res.json({ disponible: true, items });
});

function marcaDeTiempo(d = new Date()): string {
  // Hora de Perú (UTC-5), igual que el cron del servidor.
  const p = new Date(d.getTime() - 5 * 3600_000).toISOString();
  return `${p.slice(0, 10).replace(/-/g, '')}-${p.slice(11, 19).replace(/:/g, '')}`;
}

let respaldando = false;

configuracionRouter.post('/backups', async (_req, res) => {
  if (respaldando) return res.status(409).json({ error: 'Ya hay un respaldo en curso' });
  const url = process.env.DATABASE_URL;
  if (!url) return res.status(500).json({ error: 'Falta DATABASE_URL' });
  try {
    await fs.mkdir(BACKUP_DIR, { recursive: true });
  } catch {
    return res.status(500).json({ error: `No se puede escribir en ${BACKUP_DIR}` });
  }
  respaldando = true;
  const nombre = `erm2026-${marcaDeTiempo()}.sql.gz`;
  const destino = path.join(BACKUP_DIR, nombre);
  const temporal = `${destino}.tmp`;
  try {
    const dump = spawn('pg_dump', ['--no-owner', '--dbname', url], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    dump.stderr.on('data', (c) => (stderr += c));
    const salida = createWriteStream(temporal);
    dump.stdout.pipe(createGzip()).pipe(salida);
    await Promise.all([
      new Promise<void>((resolve, reject) => {
        dump.on('error', reject);
        dump.on('close', (code) => (code === 0 ? resolve() : reject(new Error(stderr.trim() || `pg_dump terminó con código ${code}`))));
      }),
      new Promise<void>((resolve, reject) => {
        salida.on('finish', resolve);
        salida.on('error', reject);
      }),
    ]);
    await fs.rename(temporal, destino);
    const st = await fs.stat(destino);
    const dto: BackupDTO = { nombre, bytes: st.size, creadoEn: st.mtime.toISOString() };
    res.status(201).json(dto);
  } catch (e) {
    await fs.unlink(temporal).catch(() => {});
    console.error('[backup] error', e);
    res.status(500).json({ error: 'No se pudo crear el respaldo' });
  } finally {
    respaldando = false;
  }
});

configuracionRouter.get('/backups/:nombre', async (req, res) => {
  const nombre = req.params.nombre;
  if (!NOMBRE_VALIDO.test(nombre)) return res.status(400).json({ error: 'Nombre inválido' });
  const ruta = path.join(BACKUP_DIR, nombre);
  try {
    await fs.access(ruta);
  } catch {
    return res.status(404).json({ error: 'Respaldo no encontrado' });
  }
  res.setHeader('Content-Type', 'application/gzip');
  res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
  createReadStream(ruta).pipe(res);
});

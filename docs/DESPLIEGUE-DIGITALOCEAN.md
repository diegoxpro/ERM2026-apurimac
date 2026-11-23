# Despliegue en DigitalOcean

Guía para poner el sistema ERM2026 (panel administrativo + PWA de personeros +
API + PostgreSQL) en un **Droplet** de DigitalOcean con HTTPS.

## Qué se despliega

```
Internet ──443──► Caddy (HTTPS automático, Let's Encrypt)
                   ├── PANEL_DOMAIN      ─► web (nginx) ──┐
                   └── PERSONERO_DOMAIN  ─► personero (nginx) ──┤ /api, /socket.io
                                                             ▼
                                                    api (Node + Prisma)
                                                             ▼
                                                    db (PostgreSQL 16, volumen)
```

Todo corre con Docker Compose en un solo servidor. Solo los puertos 22, 80 y
443 quedan abiertos; la API y la base de datos no son accesibles desde internet.

## Por qué Droplet y no App Platform

- El sistema ya está pensado para `docker compose` (4 contenedores + Postgres).
  En App Platform habría que separarlo en componentes y contratar una base
  administrada aparte.
- El dashboard usa WebSockets (Socket.IO) y la API corre migraciones al
  iniciar; en un Droplet ambos funcionan sin ajustes.
- Costo fijo y predecible durante la jornada electoral.

## Tamaño recomendado

| Uso | Droplet | Costo aprox. |
|---|---|---|
| Pruebas / capacitación | Basic, 2 GB RAM / 1 vCPU | ~US$12/mes |
| Jornada electoral | Basic, 4 GB RAM / 2 vCPU | ~US$24/mes |

- Imagen: **Ubuntu 24.04 LTS**.
- Región: la más cercana a Perú disponible (p. ej. **NYC1/NYC3** o **SFO3**).
- Autenticación: **llave SSH** (no contraseña).
- Activa **Backups** del Droplet (+20 %) para la semana de la elección.

Puedes subir de 2 GB a 4 GB unos días antes de la elección (Resize → CPU and
RAM only) y bajar después.

## Paso 1. Crear el Droplet

1. DigitalOcean → **Create → Droplets**.
2. Ubuntu 24.04, tamaño según la tabla, tu llave SSH, nombre `erm2026`.
3. Anota la **IP pública**.

## Paso 2. Apuntar los dominios

En el proveedor DNS de tu dominio (o en DigitalOcean → Networking → Domains)
crea dos registros **A** hacia la IP del Droplet, por ejemplo:

| Nombre | Tipo | Valor |
|---|---|---|
| `panel` | A | IP del Droplet |
| `personero` | A | IP del Droplet |

Comprueba que ya resuelven antes de seguir (`ping panel.tu-dominio.com`).
Caddy necesita esto para emitir los certificados.

## Paso 3. Preparar el servidor

```bash
ssh root@IP_DEL_DROPLET
git clone https://github.com/diegoxpro/erm2026-apurimac.git /opt/erm2026
cd /opt/erm2026
bash deploy/setup-droplet.sh
```

El script instala Docker y Compose, crea 2 GB de swap (el build de Vite lo
necesita en Droplets chicos), activa el firewall (solo 22/80/443) y las
actualizaciones de seguridad automáticas.

> Si el repositorio es privado, usa una *deploy key* de solo lectura o un
> token personal de GitHub para el `git clone`.

## Paso 4. Configurar `.env`

```bash
cp .env.example .env
nano .env
```

Valores a completar:

| Variable | Valor |
|---|---|
| `JWT_SECRET` | genera uno con `openssl rand -hex 48` |
| `POSTGRES_PASSWORD` | genera una con `openssl rand -hex 24` |
| `PANEL_DOMAIN` | `panel.tu-dominio.com` |
| `PERSONERO_DOMAIN` | `personero.tu-dominio.com` |
| `CORS_ORIGIN` | `https://panel.tu-dominio.com` |
| `ACME_EMAIL` | tu correo (avisos de Let's Encrypt) |
| `VITE_API_URL` | dejar **vacío** |
| `DNI_API_TOKEN` | opcional |

`WEB_PORT` y `PERSONERO_PORT` no se usan en producción (Caddy publica 80/443).

```bash
chmod 600 .env
```

## Paso 5. Levantar el sistema

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

El primer build tarda varios minutos. Para no repetir los `-f`, puedes
exportar una vez por sesión:

```bash
export COMPOSE_FILE=docker-compose.yml:docker-compose.prod.yml
```

(los comandos siguientes asumen que lo hiciste).

Revisa que todo esté arriba y que Caddy obtuvo los certificados:

```bash
docker compose ps
docker compose logs -f caddy   # busca "certificate obtained successfully"
```

## Paso 6. Cargar el catálogo (solo la primera vez)

```bash
docker compose exec api npm run seed
```

El seed crea usuarios iniciales con la contraseña **`cambiar123`**. Entra al
panel de inmediato (`https://panel.tu-dominio.com`) y cambia esas contraseñas
o reemplaza esos usuarios desde **Usuarios** antes de compartir los enlaces.

## Paso 7. Respaldos de la base

```bash
crontab -e
# respaldo cada hora; conserva 14 días en /var/backups/erm2026
0 * * * * /opt/erm2026/deploy/backup-db.sh >> /var/log/erm2026-backup.log 2>&1
```

Prueba manual: `bash deploy/backup-db.sh`.

Restaurar un respaldo:

```bash
gunzip -c /var/backups/erm2026/erm2026-AAAAMMDD-HHMMSS.sql.gz \
  | docker compose exec -T db psql -U erm2026 -d erm2026
```

Recomendado el día de la elección: copiar los respaldos fuera del servidor
(p. ej. a un Space de DigitalOcean o a tu computadora con `scp`).

## Actualizar a una nueva versión

```bash
cd /opt/erm2026
git pull
docker compose up -d --build
```

La API aplica las migraciones nuevas al iniciar. Haz un respaldo antes.

## Comandos útiles

```bash
docker compose logs -f api          # logs de la API
docker compose restart api          # reiniciar un servicio
docker compose exec db psql -U erm2026 erm2026   # consola SQL
docker stats                        # uso de CPU/RAM por contenedor
```

## Lista de verificación antes de la jornada

- [ ] Ambos dominios abren con candado (HTTPS válido).
- [ ] Contraseñas `cambiar123` eliminadas.
- [ ] Respaldo por cron funcionando y una restauración probada.
- [ ] Backups del Droplet activados.
- [ ] Droplet subido a 4 GB / 2 vCPU.
- [ ] Prueba de carga con varios personeros enviando actas a la vez.
- [ ] El dashboard de resultados se actualiza en vivo (WebSocket).

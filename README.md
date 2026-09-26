# ERM2026 Apurímac — Conteo Rápido (no oficial)

Sistema de digitación de actas y conteo rápido **no oficial** para las Elecciones
Regionales y Municipales 2026 en la región **Apurímac** (Perú). Cubre las 4
elecciones que aparecen en la cédula de sufragio:

- Gobernador y Vicegobernador Regional (alcance regional)
- Consejero Regional (por provincia)
- Alcalde y regidores Provincial (por provincia)
- Alcalde y regidores Distrital (por distrito, excepto en los 7 distritos que son
  capital de provincia, donde no hay columna distrital separada)

Datos base: padrón de mesas de ONPE (`data/raw/electores_2026_apurimac.xlsx`) y
listas de candidatura del JNE (`data/raw/cedulas_sufragio_apurimac_2026.xlsx`),
normalizados en `data/seed/*.json` por `data/scripts/parse-workbooks.js`.

> **Nota de datos:** el distrito de Grau aparece como "HUAYLLATI"/"GAMARRA" en el
> padrón de ONPE y como "HUAILLATI"/"MARISCAL GAMARRA" en la cédula del JNE. Es
> el mismo distrito con grafía distinta entre ambas fuentes oficiales; el
> importador normaliza esto explícitamente (ver `ALIAS_DISTRITO` en
> `parse-workbooks.js`).

## Arquitectura

- **`apps/api`** — Node.js + TypeScript + Express + Prisma + PostgreSQL. API REST
  de autenticación, catálogo, sincronización de actas y dashboard, más un
  WebSocket (Socket.IO) para actualizar el dashboard en tiempo real.
- **`apps/web`** — React + Vite, PWA offline-first (Service Worker + IndexedDB
  vía Dexie). El digitador descarga el catálogo completo una vez y desde ahí
  puede buscar mesas, ver la cédula y guardar actas sin conexión; sincroniza
  automáticamente al recuperar internet.
- **`packages/shared`** — Tipos y la lógica de construcción de la cédula
  (`construirCedulaMesa`), compartida entre backend y frontend para que ambos
  apliquen exactamente la misma regla de columnas.
- **`data/`** — Excel fuente, script de importación y JSON normalizado que
  alimenta el seed de la base de datos.

## Requisitos

- Node.js 20+
- Docker y Docker Compose (para desplegar en el VPS)
- Para desarrollo local sin Docker: una instancia de PostgreSQL accesible

## Desarrollo local

```bash
npm install                  # instala todo el monorepo (compila packages/shared automáticamente)
npm run import:data          # regenera data/seed/*.json desde los Excel (ya viene generado)
```

Crea `apps/api/.env` (ver `.env.example`):

```
DATABASE_URL="postgresql://usuario:clave@localhost:5432/erm2026"
JWT_SECRET="genera_un_secreto_largo"
PORT=4000
CORS_ORIGIN="http://localhost:5173"
```

Aplica las migraciones y carga los datos:

```bash
cd apps/api
npx prisma migrate deploy
npm run seed
```

Crea `apps/web/.env`:

```
VITE_API_URL=http://localhost:4000
```

Levanta ambos servicios (en dos terminales, desde la raíz):

```bash
npm run dev:api
npm run dev:web
```

Abre `http://localhost:5173`.

### Usuarios de prueba (creados por el seed)

| DNI | Rol | Contraseña |
|---|---|---|
| 00000001 | ADMIN | cambiar123 |
| 00000002 | SUPERVISOR | cambiar123 |
| 00000003 | DIGITADOR | cambiar123 |

**Cambia estas contraseñas antes de cualquier uso real.** El seed no debe
correr en un ambiente accesible públicamente sin cambiarlas primero.

## Despliegue en un VPS con Docker

```bash
cp .env.example .env    # completa DATABASE_URL/JWT_SECRET/POSTGRES_*/VITE_API_URL reales
docker compose up -d --build
```

El contenedor `api` corre `prisma migrate deploy` automáticamente al iniciar.
Para cargar el catálogo la primera vez:

```bash
docker compose exec api npm run seed
```

`VITE_API_URL` debe apuntar a la URL pública donde los digitadores accederán a
la API (por ejemplo `http://<ip-del-vps>:4000`) — se usa como build arg del
frontend, así que si cambia hay que reconstruir la imagen `web`.

**Este despliegue expone HTTP simple (puertos 80 y 4000), sin HTTPS.** Para un
uso real con digitadores en campo (y para no enviar credenciales en claro) se
necesita un dominio apuntando al VPS y un reverse proxy con certificado
(Caddy o Nginx + certbot) delante de ambos servicios — no incluido aquí porque
requiere un dominio real que aún no se ha definido.

## Limitaciones conocidas de este piloto

- Digitación simple, sin doble digitación ni validaciones automáticas de
  consistencia (fue una decisión explícita para esta primera versión).
- No incluye captura/adjunto de la foto del acta física.
- Sin HTTPS por defecto (ver sección de despliegue).
- La lista de organizaciones políticas y candidatos es la vigente al momento
  de la importación; si el JNE actualiza listas (tachas, exclusiones, etc.),
  hay que volver a exportar el Excel de cédulas y correr `npm run import:data`
  + `npm run seed`.

FROM node:20-alpine AS base
# El motor de Prisma necesita OpenSSL; node:20-alpine no lo trae instalado.
RUN apk add --no-cache openssl
# pg_dump para el botón "Crear respaldo ahora" del panel (Configuración > Respaldos).
# Misma versión mayor que la base (postgres:16); la 17 también sirve para respaldar una 16.
RUN apk add --no-cache postgresql16-client || apk add --no-cache postgresql17-client
WORKDIR /app

COPY package.json package-lock.json* ./
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
COPY data/seed ./data/seed

RUN npm install --workspace=@erm2026/api --workspace=@erm2026/shared --include-workspace-root

RUN npm run build --workspace=@erm2026/shared

WORKDIR /app/apps/api
RUN npx prisma generate
RUN npm run build

EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]

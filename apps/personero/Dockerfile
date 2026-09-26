FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
COPY packages/shared ./packages/shared
COPY apps/personero ./apps/personero

RUN npm install --workspace=@erm2026/personero --workspace=@erm2026/shared --include-workspace-root
RUN npm run build --workspace=@erm2026/shared

ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

WORKDIR /app/apps/personero
RUN npm run build

FROM nginx:1.27-alpine
COPY apps/personero/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/personero/dist /usr/share/nginx/html
EXPOSE 80

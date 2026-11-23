#!/usr/bin/env bash
# Respaldo de la base PostgreSQL de ERM2026 con rotación.
# Pensado para cron, p. ej. cada hora durante la jornada electoral:
#   0 * * * * /opt/erm2026/deploy/backup-db.sh >> /var/log/erm2026-backup.log 2>&1
set -euo pipefail

REPO_DIR="${REPO_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/erm2026}"
KEEP_DAYS="${KEEP_DAYS:-14}"

cd "$REPO_DIR"
# Lee POSTGRES_USER / POSTGRES_DB del .env del proyecto.
set -a; . ./.env; set +a

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/erm2026-$STAMP.sql.gz"

docker compose exec -T db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner \
  | gzip > "$OUT"

find "$BACKUP_DIR" -name 'erm2026-*.sql.gz' -mtime +"$KEEP_DAYS" -delete
echo "$(date -Is) respaldo creado: $OUT ($(du -h "$OUT" | cut -f1))"

#!/bin/sh
set -eu

BACKUP_DIR="${CORTEX_BACKUP_DIR:-/backups}"
RETENTION_DAYS="${CORTEX_BACKUP_RETENTION_DAYS:-7}"
INTERVAL_SECONDS="${CORTEX_BACKUP_INTERVAL_SECONDS:-86400}"
mkdir -p "$BACKUP_DIR"

while true; do
  TS=$(date -u +%Y%m%dT%H%M%SZ)
  OUT="$BACKUP_DIR/cortex-$TS.dump"
  export PGPASSWORD="$(tr -d '\n' < /run/secrets/cortex_postgres_password)"
  echo "{\"event\":\"backup_started\",\"file\":\"$OUT\"}"
  if pg_dump -Fc -h db -U cortex -d cortex -f "$OUT"; then
    echo "{\"event\":\"backup_completed\",\"file\":\"$OUT\"}"
    find "$BACKUP_DIR" -name 'cortex-*.dump' -type f -mtime +"$RETENTION_DAYS" -delete
    find "$BACKUP_DIR" -name 'cortex-*.sql.gz' -type f -mtime +"$RETENTION_DAYS" -delete
  else
    rm -f "$OUT"
    echo "{\"event\":\"backup_failed\"}" >&2
  fi
  sleep "$INTERVAL_SECONDS"
done

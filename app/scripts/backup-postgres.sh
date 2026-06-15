#!/bin/sh
set -eu

BACKUP_DIR="${CORTEX_BACKUP_DIR:-/backups}"
RETENTION_DAYS="${CORTEX_BACKUP_RETENTION_DAYS:-7}"
INTERVAL_SECONDS="${CORTEX_BACKUP_INTERVAL_SECONDS:-86400}"
mkdir -p "$BACKUP_DIR"

# Alerta best-effort via webhook (usa node, presente na imagem). Nunca derruba o backup.
notify() {
  if [ -n "${CORTEX_ALERT_WEBHOOK_URL:-}" ]; then
    node -e "fetch(process.env.CORTEX_ALERT_WEBHOOK_URL,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text:'[Cortex] '+process.argv[1]})}).catch(()=>{})" "$1" || true
  fi
}

while true; do
  TS=$(date -u +%Y%m%dT%H%M%SZ)
  OUT="$BACKUP_DIR/cortex-$TS.dump"
  export PGPASSWORD="$(tr -d '\n' < /run/secrets/cortex_postgres_password)"
  echo "{\"event\":\"backup_started\",\"file\":\"$OUT\"}"
  if pg_dump -Fc -h db -U cortex -d cortex -f "$OUT"; then
    echo "{\"event\":\"backup_completed\",\"file\":\"$OUT\"}"
    find "$BACKUP_DIR" -name 'cortex-*.dump' -type f -mtime +"$RETENTION_DAYS" -delete
    find "$BACKUP_DIR" -name 'cortex-*.sql.gz' -type f -mtime +"$RETENTION_DAYS" -delete

    # Cópia offsite opcional (rclone). Sem o remoto configurado, segue só com backup local.
    if [ -n "${CORTEX_BACKUP_RCLONE_REMOTE:-}" ]; then
      if rclone copy "$OUT" "$CORTEX_BACKUP_RCLONE_REMOTE"; then
        echo "{\"event\":\"backup_offsite_ok\",\"remote\":\"$CORTEX_BACKUP_RCLONE_REMOTE\"}"
      else
        echo "{\"event\":\"backup_offsite_failed\"}" >&2
        notify "Backup offsite FALHOU em $TS"
      fi
    fi
  else
    rm -f "$OUT"
    echo "{\"event\":\"backup_failed\"}" >&2
    notify "Backup do banco FALHOU em $TS"
  fi
  sleep "$INTERVAL_SECONDS"
done

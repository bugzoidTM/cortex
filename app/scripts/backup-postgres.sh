#!/bin/sh
set -eu

BACKUP_DIR="${CORTEX_BACKUP_DIR:-/backups}"
RETENTION_DAYS="${CORTEX_BACKUP_RETENTION_DAYS:-7}"
INTERVAL_SECONDS="${CORTEX_BACKUP_INTERVAL_SECONDS:-86400}"
mkdir -p "$BACKUP_DIR"

# Alerta best-effort via webhook e/ou e-mail (usa node+nodemailer, presentes na imagem).
# Nunca derruba o backup.
notify() {
  if [ -n "${CORTEX_ALERT_WEBHOOK_URL:-}" ]; then
    node -e "fetch(process.env.CORTEX_ALERT_WEBHOOK_URL,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text:'[Cortex] '+process.argv[1]})}).catch(()=>{})" "$1" || true
  fi
  if [ -n "${CORTEX_ALERT_EMAIL:-}" ]; then
    node -e "const nm=require('nodemailer');const fs=require('fs');const pass=process.env.SMTP_PASSWORD||(process.env.SMTP_PASSWORD_FILE?fs.readFileSync(process.env.SMTP_PASSWORD_FILE,'utf8').trim():null);if(!pass||!process.env.SMTP_HOST)process.exit(0);nm.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||'587'),secure:process.env.SMTP_SECURE==='true',auth:{user:process.env.SMTP_USER,pass}}).sendMail({from:process.env.SMTP_FROM||process.env.SMTP_USER,to:process.env.CORTEX_ALERT_EMAIL,subject:'[Cortex alerta] '+process.argv[1],text:process.argv[1]}).then(()=>process.exit(0)).catch(()=>process.exit(0))" "$1" || true
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

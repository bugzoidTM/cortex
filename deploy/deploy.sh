#!/bin/sh
# Deploy confiável do Cortex no Docker Swarm.
#
# IMPORTANTE: `docker stack deploy` NÃO recria os serviços quando muda apenas o
# conteúdo da imagem (a tag `cortex:latest` sem digest deixa a spec inalterada,
# então o Swarm trata como no-op e a task segue na imagem antiga). Por isso,
# após build + stack deploy, forçamos a atualização da imagem em web e worker.
#
# Uso (no servidor, dentro de /root/cortex):  sh deploy/deploy.sh
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== git pull =="
git pull --ff-only origin main

echo "== docker build =="
docker build -t cortex:latest "$ROOT/app"

echo "== docker stack deploy =="
docker stack deploy -c "$ROOT/deploy/cortex-stack.yml" cortex

echo "== force-update (garante a imagem nova nas tasks, evita no-op de stack deploy) =="
docker service update --force --image cortex:latest cortex_web
docker service update --force --image cortex:latest cortex_worker

echo "== health =="
for i in $(seq 1 40); do
  H=$(curl -s -o /dev/null -w '%{http_code}' https://cortex.nutef.com/api/health || echo 000)
  [ "$H" = "200" ] && { echo "health=200"; break; }
  sleep 3
done
echo "deploy done"

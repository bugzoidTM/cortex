# Deploy Cortex

Domínio de produção: https://cortex.nutef.com/

## Stack atual

- App: Next.js em `/root/cortex/app`
- Imagem Docker local: `cortex:latest`
- Serviço Docker Swarm: `cortex_web`
- Rede Traefik: `Nutef`
- Stack file: `/root/cortex/deploy/cortex-stack.yml`
- Reverse proxy: Traefik com Let's Encrypt (`letsencryptresolver`)

## Validar localmente antes de publicar

```bash
cd /root/cortex/app
npm run test:smoke
npm run lint
npm run build
```

## Build e deploy

```bash
cd /root/cortex/app
docker build -t cortex:latest .
docker stack deploy -c /root/cortex/deploy/cortex-stack.yml cortex
```

## Verificação em produção

```bash
docker service ps cortex_web --no-trunc
docker service logs cortex_web --tail 80 --raw
curl -I https://cortex.nutef.com/
curl -L https://cortex.nutef.com/ | grep -o '<title>[^<]*</title>' | head -1
```

Resultado esperado:

- HTTP `200` em `https://cortex.nutef.com/`
- Título: `Cortex — Núcleo de conteúdo autônomo`
- Certificado Let's Encrypt válido para `cortex.nutef.com`

## Observação de segurança

`npm audit --omit=dev` reportou vulnerabilidade moderada herdada por `next@16.2.9` via `postcss <8.5.10`. No momento da verificação, `npm view next version` retornou `16.2.9`; `npm audit fix --force` propõe downgrade quebrado para `next@9.3.3`, então não foi aplicado. Revisar quando houver release estável do Next corrigindo a cadeia.

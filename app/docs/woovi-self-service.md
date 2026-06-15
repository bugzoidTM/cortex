# Cortex self-service com Woovi Pix

Runbook de configuração do checkout self-service do Cortex com Woovi/OpenPix, webhooks e e-mails transacionais.

## Objetivo

Permitir que um cliente crie tenant, usuário owner, assinatura e invoice pelo site público, pague via Pix Woovi e tenha a assinatura liberada automaticamente quando o webhook confirmar pagamento.

Fluxo principal:

1. Usuário preenche o checkout público do Cortex.
2. `POST /api/checkout` cria uma cobrança Woovi em `/api/v1/charge`.
3. O Cortex cria `Tenant`, `User`, `TenantMembership`, `Subscription` e `PaymentInvoice` com status inicial `PENDING`.
4. Woovi envia webhook `OPENPIX:CHARGE_COMPLETED` para `/api/webhooks/woovi`.
5. O Cortex marca invoice como `PAID`, assinatura como `ACTIVE`, define período mensal e libera jobs.
6. `POST /api/jobs` bloqueia tenants com billing pendente/inadimplente retornando `billing_blocked`.

## Configuração na Woovi

No painel Woovi:

1. Acesse `Api/Plugins`.
2. Copie o `AppID` da aplicação.
3. Em `Novo Webhook`, cadastre a URL de produção:
   - `https://cortex.nutef.com/api/webhooks/woovi`
4. Evento obrigatório:
   - `OPENPIX:CHARGE_COMPLETED`
5. Configure um segredo compartilhado para o webhook e envie-o no header `Authorization`.

Importante: a API da Woovi usa `Authorization` com o AppID puro, sem prefixo `Bearer`. Regra operacional: Authorization sem Bearer. O cliente HTTP do Cortex deve enviar `Authorization: <AppID>`.

## Variáveis e secrets

Preferir Docker secrets para credenciais:

- `WOOVI_APP_ID_FILE=/run/secrets/cortex_woovi_app_id`
- `CORTEX_WOOVI_WEBHOOK_SECRET_FILE=/run/secrets/cortex_woovi_webhook_secret`
- `SMTP_PASSWORD_FILE=/run/secrets/cortex_smtp_password`

Variáveis não secretas:

- `WOOVI_API_BASE_URL=https://api.woovi.com`
- `SMTP_HOST=<host smtp>`
- `SMTP_PORT=587`
- `SMTP_SECURE=false`
- `SMTP_USER=<usuario smtp>`
- `SMTP_FROM=Cortex <no-reply@nutef.com>`
- `CORTEX_PUBLIC_URL=https://cortex.nutef.com`

## Docker Swarm

Criar secrets via stdin na VPS:

```bash
printf '%s' '<WOOVI_APP_ID>' | docker secret create cortex_woovi_app_id -
printf '%s' '<WEBHOOK_SECRET>' | docker secret create cortex_woovi_webhook_secret -
printf '%s' '<SMTP_PASSWORD>' | docker secret create cortex_smtp_password -
```

Depois montar os secrets nos serviços `cortex_web` e, se e-mails assíncronos forem adicionados no futuro, no worker correspondente.

## Rotas

- `POST /api/checkout`
  - Entrada: plano, nome, empresa, e-mail, senha, telefone e CPF/CNPJ opcional.
  - Saída: `paymentLinkUrl`, `brCode`, `qrCodeImage`, `correlationID`.

- `POST /api/webhooks/woovi`
  - Recebe webhook Woovi.
  - Valida `CORTEX_WOOVI_WEBHOOK_SECRET` quando configurado.
  - Processa `OPENPIX:CHARGE_COMPLETED`.

- `POST /api/auth/forgot-password`
  - Gera `PasswordResetToken` e envia e-mail transacional.

- `POST /api/auth/reset-password`
  - Valida token, troca senha e invalida sessões antigas.

## Runtime sanitizado

`GET /api/runtime` deve mostrar somente status seguro:

- `woovi.configured`
- `woovi.apiKeySource`
- `woovi.webhookSecretConfigured`
- `woovi.baseUrl`
- `email.configured`
- `email.provider`
- `email.passwordSource`

Nunca retornar AppID, segredo de webhook ou senha SMTP.

## Verificação

Validações locais:

```bash
npm run test:self-service-billing
npm run prisma:generate
npm run lint
npm run build
```

Verificações de produção sem credenciais:

```bash
curl -fsS https://cortex.nutef.com/api/health
curl -fsS https://cortex.nutef.com/api/runtime | python3 -m json.tool
```

Teste real de checkout só deve ser feito quando `WOOVI_APP_ID_FILE` e webhook estiverem configurados em produção.

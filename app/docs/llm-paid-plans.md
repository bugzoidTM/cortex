# Cortex — LLM para teste BYOK e planos pagos

## Teste de 14 dias com chave do usuário

O tenant autenticado pode abrir o console do cliente e preencher “Teste de 14 dias / Sua própria chave API”.

Campos esperados:
- Provider: nome livre, ex. `openai`, `openrouter`, `groq`, `closeai`.
- Base URL: endpoint OpenAI-compatible sem `/chat/completions`, ex. `https://api.openai.com/v1`.
- Modelo: ex. `gpt-4o-mini`, `qwen3.7-max`, `llama-3.3-70b-versatile`.
- API key: chave do próprio usuário.

Comportamento:
- A chave é salva em `TenantLlmCredential.encryptedApiKey`, criptografada com AES-256-GCM.
- A tela e a API retornam apenas `apiKeyPreview`, nunca a chave bruta nem `encryptedApiKey`.
- `trialEndsAt` é definido para `now + 14 dias`.
- Enquanto `trialActive=true`, o gateway prefere a credencial BYOK do tenant antes do provider global.
- O ledger marca o provider como `<provider>-byokTrial` e custo interno como zero, porque o custo do teste fica na conta do usuário.

Variável obrigatória para habilitar BYOK:

```bash
CORTEX_BYOK_ENCRYPTION_SECRET='<segredo aleatório com pelo menos 32 caracteres>'
```

Em Swarm, configure como secret/env antes de permitir testes públicos. Sugestão:

```bash
openssl rand -base64 48 | docker secret create cortex_byok_encryption_secret -
```

Depois monte no serviço `web` e `worker` e exporte o conteúdo para `CORTEX_BYOK_ENCRYPTION_SECRET` no entrypoint/stack, ou use env segura equivalente.

## Plano pago — LLM gerenciado pela Nutef

Nos planos pagos o usuário não precisa trazer chave própria. A Nutef configura um provider OpenAI-compatible global ou por tenant no painel `/admin`.

O que continua como secret operacional:
- `OPENAI_COMPATIBLE_API_KEY_FILE` apontando para um Docker secret com a chave real.

O que fica no banco em `LLMProviderConfig`:
- `provider`
- `baseUrl`
- `model`
- `inputCostPer1M`
- `outputCostPer1M`
- `maxOutputTokens`
- `timeoutMs`
- `enabled`
- `isDefault`
- `tenantId` opcional para configuração específica de cliente

Configuração recomendada atual:
- Provider: `closeai`
- Base URL: `https://closeai.nutef.com/v1`
- Modelo: `qwen3.7-max`
- Chave: Docker secret consumido via `OPENAI_COMPATIBLE_API_KEY_FILE`

Fluxo operacional para configurar plano pago:

1. Criar ou atualizar o secret da chave do provider:

```bash
printf '%s' 'SUA_CHAVE_REAL' | docker secret create cortex_openai_compatible_api_key -
```

2. Garantir no stack do Cortex que `web` e `worker` recebam:

```yaml
environment:
  OPENAI_COMPATIBLE_API_KEY_FILE: /run/secrets/cortex_openai_compatible_api_key
secrets:
  - cortex_openai_compatible_api_key
```

3. Entrar no Cortex com usuário superadmin permitido em `CORTEX_SUPERUSER_EMAILS`.

4. Abrir `/admin` e preencher “Modelo padrão”:
   - Escopo `Global` para todos os planos pagos, ou tenant específico para contrato dedicado.
   - Marcar `Habilitado` e `Padrão`.
   - Informar preços por 1M tokens para o ledger calcular margem.

5. Verificar status sanitizado:

```bash
curl -s https://cortex.nutef.com/api/runtime
```

Esperado para planos pagos:
- `llm.configured=true`
- `llm.apiKeySource=file`
- `llm.configSource=database`
- `llm.provider=closeai` ou provider configurado no admin
- Sem vazamento de chave bruta.

6. Criar/ajustar o tenant no `/admin`:
   - `plan`: nome comercial, ex. `starter`, `pro`, `business`.
   - `monthlyQuota`: limite mensal de tokens incluídos.

7. Criar usuário do cliente e entregar acesso.

## Prioridade de resolução no gateway

1. Se o tenant tem `TenantLlmCredential` ativa e `trialEndsAt` no futuro, usa BYOK trial.
2. Caso contrário, usa `LLMProviderConfig` do tenant.
3. Caso contrário, usa `LLMProviderConfig` global padrão.
4. Se não houver provider/chave gerenciada, cai no fallback determinístico interno.

## Segurança mínima antes de lançamento público pago

- `CORTEX_BYOK_ENCRYPTION_SECRET` definido e persistente; não trocar sem migração/recriptografia das chaves existentes.
- `OPENAI_COMPATIBLE_API_KEY_FILE` montado em `web` e `worker`.
- `/api/runtime` verificado sem vazamento de segredo.
- `CORTEX_SUPERUSER_EMAILS` restrito aos operadores reais.
- Quota mensal por tenant configurada antes de entregar usuário.
- Trial BYOK comunicado como custo por conta do usuário.

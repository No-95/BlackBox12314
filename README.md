# Agent-Box-v1

Portable, zero-budget AI Company in a box for B2B workflows.

## What is included

- n8n orchestrator with AI-ready setup
- PostgreSQL for n8n state + agent memory
- Browserless Chrome for Playwright automation
- Optional Ollama for local AI models (GPU profile)
- Playwright poster webhook service
- Prompt pack for Team Phap Che (Legal Agent)
- Trend Scout workflow blueprint (n8n)

## Quick start

1. Copy env template.

   ```bash
   cp .env.example .env
   ```

2. Fill your secrets and API keys in `.env`.

3. Start core services.

   ```bash
   docker compose up -d
   ```

4. Optional local AI (Ollama) profile.

   ```bash
   docker compose --profile local-ai up -d
   ```

5. Open n8n:

   - http://localhost:5678

## Convex setup (optional)

1. Install dependencies at repo root.

   ```bash
   npm install
   ```

2. Authenticate and create/select a Convex project.

   ```bash
   npx convex dev
   ```

3. Add `CONVEX_URL` and `CONVEX_DEPLOY_KEY` in `.env`.

4. Deploy Convex functions.

   ```bash
   npm run deploy
   ```

## 24/7 hybrid strategy

- Set `AI_MODE=cloud` to use free cloud providers from n8n credentials.
- Set `AI_MODE=local` to route prompts to Ollama.
- Keep both available for failover.

## Notes

- `host.docker.internal` is enabled so cloud-hosted n8n can call local endpoints like ComfyUI/Ollama when tunneled.
- Keep social posting in draft/approval mode until tested against each platform terms.

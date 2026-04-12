# Marketing Team

This folder contains the Marketing Team implementation for Agent-Box-v1.

## MVP agents (phase 1)

1. Trend Scout
2. Content Strategist
3. Copywriter
4. Social Media Manager
5. Brand Voice Guardian
6. Analytics Agent

## Objective

Run a repeatable B2B content pipeline:

trend sensing -> planning -> copy generation -> QA -> scheduling -> analytics feedback

## Build order

1. `agents/trend-scout.md`
2. `agents/content-strategist.md`
3. `agents/copywriter.md`
4. `agents/brand-guardian.md`
5. `agents/social-media-manager.md`
6. `agents/analytics-agent.md`

## Runtime notes

- Orchestrator: n8n
- Storage: PostgreSQL (or Convex in parallel)
- Media posting: Playwright webhook service
- Legal review: Team Phap Che prompt in `prompts/team-phap-che-system-prompt.md`

## Status board

- [x] Team folder created
- [x] Agent specs created
- [x] Handoff contracts created
- [x] Daily runbook created
- [ ] n8n workflow JSON implementation
- [ ] End-to-end dry run with sample campaign

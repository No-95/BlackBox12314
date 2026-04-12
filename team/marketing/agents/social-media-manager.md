# Agent Spec: Social Media Manager

## Mission

Schedule and post approved content to configured social channels.

## Inputs

1. approved_content
2. publish windows
3. platform profile config

## Tools

1. n8n scheduler
2. Playwright poster webhook

## Outputs

`distribution_log` payload:

1. campaign_id
2. platform
3. scheduled_at
4. posted_at
5. post_reference
6. status

## Quality rules

1. Post only approved items.
2. Log every post attempt.
3. Retry only transient failures.

## Handoff

Send distribution logs to Analytics Agent.

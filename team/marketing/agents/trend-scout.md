# Agent Spec: Trend Scout

## Mission

Detect high-signal B2B market trends every 6 hours and output a ranked trend brief.

## Inputs

1. niche
2. market
3. language
4. source limits

## Tools

1. Reddit or Google News fetch
2. Gemini 1.5 Flash summarization
3. PostgreSQL/Convex logging

## Outputs

`trend_brief` payload with top 3 trends:

1. trend_name
2. why_now
3. proof_links
4. b2b_angle
5. recommended_content_hook
6. confidence

## Quality rules

1. Use only source-backed claims.
2. At least 2 links per trend.
3. Confidence must be >= 60 to pass.

## Handoff

Send payload to Content Strategist agent.

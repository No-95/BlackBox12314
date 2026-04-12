# Trend Scout Workflow Logic (n8n)

Goal: every 6 hours, collect niche trends from Reddit or Google News, summarize top 3 with Gemini 1.5 Flash, and pass output to Content Creator agent.

## Workflow Overview

1. Trigger: Schedule every 6 hours.
2. Source fetch: Reddit API or Google News RSS.
3. Normalize articles/posts.
4. Deduplicate by URL/title similarity.
5. LLM summarize with Gemini 1.5 Flash.
6. Push final brief to Content Creator webhook/queue.
7. Save audit log to PostgreSQL.

## Nodes and Configuration

1. Schedule Trigger
- Type: Schedule
- Mode: Every X hours
- Interval: 6

2. Set Niche Inputs
- Type: Set
- Fields example:
  - niche: "nextjs performance"
  - market: "B2B SaaS"
  - language: "vi,en"

3. HTTP Request: Reddit Search
- URL: https://www.reddit.com/search.json
- Query params:
  - q: {{$json.niche}}
  - sort: new
  - limit: 20
- Headers: User-Agent required

4. HTTP Request: Google News RSS (optional second source)
- URL pattern:
  - https://news.google.com/rss/search?q={{$json.niche}}&hl=en-US&gl=US&ceid=US:en

5. Code Node: Normalize + Merge
- Convert Reddit/News payloads to common schema:
  - source
  - title
  - url
  - snippet
  - published_at
- Keep top 30 latest items.

6. Code Node: Deduplicate
- Remove duplicates by normalized URL and near-identical title.

7. Gemini Node (or HTTP Request to Gemini API)
- Model: gemini-1.5-flash
- Prompt purpose:
  - extract top 3 trends
  - each trend should include:
    - trend_name
    - why_now
    - proof_links (2-3)
    - b2b_angle
    - recommended_content_hook
- Output format: strict JSON

Suggested prompt body:
"""
You are Trend Scout for a B2B company.
From the provided items, output top 3 trends only.
Prioritize recency, business impact, and repeat mentions.
Return strict JSON:
{
  \"generated_at\": \"ISO-8601\",
  \"niche\": \"string\",
  \"trends\": [
    {
      \"trend_name\": \"string\",
      \"why_now\": \"string\",
      \"proof_links\": [\"url1\", \"url2\"],
      \"b2b_angle\": \"string\",
      \"recommended_content_hook\": \"string\",
      \"confidence\": 0-100
    }
  ]
}
"""

8. IF Node: Quality Gate
- Condition examples:
  - trends count is 3
  - each trend confidence >= 60
- If fail, send alert to Telegram and stop.

9. HTTP Request: Send to Content Creator Agent
- Method: POST
- URL: your internal webhook (example: http://n8n-ai:5678/webhook/content-creator)
- Body: Gemini JSON output + niche metadata

10. PostgreSQL Node: Save Trend Brief
- Table: agent_jobs or trend_briefs
- Save run_id, niche, trends_json, status, created_at

## Handoff Contract to Content Creator Agent

Payload recommended shape:

{
  "task_type": "content_brief",
  "niche": "nextjs performance",
  "market": "B2B SaaS",
  "trends": [
    {
      "trend_name": "...",
      "why_now": "...",
      "proof_links": ["..."],
      "b2b_angle": "...",
      "recommended_content_hook": "...",
      "confidence": 82
    }
  ],
  "output_requirements": {
    "channels": ["linkedin", "facebook", "tiktok"],
    "language": ["vi", "en"],
    "formats": ["short_post", "script_30s", "carousel_caption"]
  }
}

## Free-Tier Reliability Tips

1. Cache previous links to avoid reprocessing same stories.
2. Limit fetch volume to keep API usage low.
3. Keep a fallback summarizer model if Gemini quota is exhausted.
4. Store last successful brief and reuse if current run fails.

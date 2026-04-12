# n8n Workflow Map: Marketing Team MVP

## Workflow 1: trend-scout

1. Schedule Trigger (every 6 hours)
2. Set (niche config)
3. HTTP Request (Reddit/Google News)
4. Code (normalize + dedupe)
5. Gemini summarize (top 3 trends)
6. IF (quality threshold)
7. DB save (trend_brief)
8. Execute Workflow: content-strategist

## Workflow 2: content-strategist

1. Webhook/Execute Workflow trigger
2. AI node (build weekly plan)
3. Code (add campaign_id, content_ids)
4. DB save (content_plan)
5. Execute Workflow: copywriter

## Workflow 3: copywriter

1. Trigger from content-strategist
2. AI node (generate drafts)
3. DB save (content_drafts)
4. Execute Workflow: brand-guardian

## Workflow 4: brand-guardian

1. Trigger from copywriter
2. AI node (brand scoring)
3. IF score >= 8 then continue else return rewrite tasks
4. Execute Workflow: legal-check

## Workflow 5: legal-check

1. Trigger from brand-guardian
2. AI node with Team Phap Che prompt
3. IF legal risk <= 3 then continue else block and notify
4. Execute Workflow: social-distribution

## Workflow 6: social-distribution

1. Trigger from legal-check
2. Split in Batches (per platform)
3. HTTP Request -> Playwright poster webhook
4. DB save (distribution_log)
5. Execute Workflow: analytics-daily

## Workflow 7: analytics-daily

1. Schedule Trigger (18:00 daily)
2. DB query (today posts + interactions)
3. AI summary (wins, losses, recommendations)
4. Send report (Telegram/Email)
5. DB save (weekly_marketing_report source data)

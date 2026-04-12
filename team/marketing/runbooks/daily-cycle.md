# Daily Cycle Runbook (Marketing Pod)

## Schedule

1. 08:00 - Trend Scout run
2. 09:00 - Content Strategist plan lock
3. 10:00 - Copywriter draft generation
4. 13:00 - Brand + Legal QA
5. 15:00 - Social scheduling and posting queue
6. 18:00 - Analytics snapshot + next-day suggestions

## Execution steps

1. Trend Scout creates `trend_brief` payload.
2. Content Strategist converts brief to `content_plan` payload.
3. Copywriter generates `content_drafts` payload.
4. Brand Voice Guardian validates drafts and returns approved items.
5. Team Phap Che validates legal/compliance risk for approved items.
6. Social Media Manager schedules approved items and logs post IDs.
7. Analytics Agent updates KPI snapshot and optimization notes.

## Publish gate

A post can be scheduled only if:

1. brand_score >= 8
2. legal_risk_score <= 3
3. cta_present = true
4. campaign_id is set

## Failure policy

1. If any step fails, mark job status as `blocked`.
2. Emit Telegram alert with agent name, run_id, and error summary.
3. Auto-retry up to 2 times for network/API errors.
4. Do not auto-retry legal/brand failures. Send back to Copywriter.

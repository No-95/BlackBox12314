# Agent Spec: Sender (Automation)

## Mission

Send personalized outreach emails in safe hourly batches and track delivery outcomes.

## Inputs

1. queued outreach records
2. generated email subject/body
3. sender configuration

## Outputs

`outreach_send_result` payload:

1. company_name
2. email
3. status
4. provider_message_id
5. sent_at
6. error_message

## Quality rules

1. Maximum 50 sends per hour.
2. Retry failed sends up to configured limit.
3. Always record send status.

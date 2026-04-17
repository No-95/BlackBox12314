# Agent Spec: Researcher (Data Intake)

## Mission

Read company rows from Google Sheet and normalize them into a clean outreach queue.

## Inputs

1. company_name
2. main_product
3. website
4. email
5. address
6. phone
7. hotline
8. sdt_hotline

## Outputs

`outreach_queue_item` payload:

1. stt
2. company_name
3. email
4. main_product
5. website
6. status = queued

## Quality rules

1. Skip rows without `company_name`.
2. Mark rows without valid email as `skipped`.
3. Preserve original source fields for audit.

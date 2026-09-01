# Enrichment Lambda

`GET /accounts/{id}/enriched`

1. Read the account ID from the path (`event.pathParameters.id`). If it is missing, return `400`.
2. Check the cache first, using the `enrichment-cache` table, keyed by `account_id`. If there is a cached entry and it has not expired (`expires_at > now`), return the cached narrative immediately; no Bedrock call, no fresh DynamoDB reads of account or transactions. This is the performance and cost optimization: do not regenerate an AI narrative on every request for the same account within the TTL window.
3. On a cache miss, fetch the real data: `GetItem` on `accounts` (returning `404` if the account does not exist), then `Query` on `transactions` for that account's full transaction history.
4. Fetch the prompt template from SSM (`getPromptTemplate()`), with an in-memory cache (`cachedPrompt`, a module-level variable) so it is only fetched once per warm Lambda container, not on every invocation. SSM calls are not instant; caching avoids that latency on repeat invocations.
5. Build the actual prompt by substituting the account and transaction JSON into placeholder tokens (`[[account]]`, `[[transactions]]`) in that template.
6. Call Bedrock (`ConverseCommand`, with `maxTokens` set explicitly to avoid unbounded quota reservation) with that prompt, expecting the model to return JSON containing `narrative` and `action_flag`.
7. On success, parse the model's response, write it to `enrichment-cache` with a one-hour TTL (`nowSeconds() + 3600`), and return the enriched result: account, transactions, narrative, and action flag.
8. On any failure in that Bedrock, parse, or cache-write path (Bedrock down, malformed response, etc.), the `try/catch` catches it and returns the account and transaction data anyway, with `narrative` and `action_flag` set to `null` and a response header `x-enrichment-status: degraded`. This is the spec's explicit requirement: never fail the whole request just because the AI enrichment step failed; degrade gracefully instead.

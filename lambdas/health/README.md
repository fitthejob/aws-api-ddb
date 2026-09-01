# Health Lambda

`GET /health`

1. Runs two reachability checks in parallel via `Promise.all`, one against DynamoDB and one against Bedrock; neither check depends on the other, so there is no reason to run them sequentially.
2. The DynamoDB check calls `DescribeTableCommand` against the accounts table. A successful response means the table exists and the Lambda's role can reach it; any thrown error, regardless of cause, is treated as `"unreachable"`.
3. The Bedrock check calls `ListFoundationModelsCommand`. This confirms the Bedrock Runtime endpoint is reachable and the Lambda's role has at least list-level Bedrock access; it does not call `InvokeModel` or `Converse`, so it does not exercise the same IAM permissions the enrichment Lambda actually depends on.
4. Both checks swallow their own errors internally and return a plain `"reachable"`/`"unreachable"` string rather than propagating the underlying exception; the response body never includes error detail, only the two status strings.
5. The overall response is `200` only if both dependencies report `"reachable"`; if either is `"unreachable"`, the response is `503`. The body always includes both dependency statuses regardless of the overall status code, so a caller can see which dependency failed.

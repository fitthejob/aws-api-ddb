# Observability Module

1. Creates a single CloudWatch dashboard, named `<project_name>-<environment>`, with four widgets laid out in a 2x2 grid.
2. Widget one shows API Gateway latency (`AWS/ApiGateway` `Latency`, average), scoped by `ApiName` to this project's REST API.
3. Widget two shows API Gateway error rate (`4XXError` and `5XXError`, summed) on the same API.
4. Widget three shows the enrichment Lambda's duration and error count (`AWS/Lambda` `Duration`/`Errors`, scoped by `FunctionName`).
5. Widget four shows the enrichment Lambda's cache hit ratio, reading the custom `CacheHit`/`CacheMiss` metrics under namespace `DebtPortfolio/Enrichment`. These are emitted by `lambdas/enrichment/index.mjs` as embedded metric format (EMF) log lines rather than direct `PutMetricData` calls, since EMF is picked up automatically by CloudWatch Logs without an extra API call or IAM permission on the Lambda's role.
6. All widget metrics use `var.aws_region` for their `region` property, so the dashboard renders correctly regardless of which region the stack is deployed into.
7. This module only builds the dashboard; it consumes function names and the REST API ID as inputs rather than creating any of those resources itself.

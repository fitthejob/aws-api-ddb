# Debt Portfolio Intelligence API

Serverless REST API on AWS, built with Terraform, providing governed access to debt consolidation account and transaction data for internal analysts.

## Status

Phases 1 through 4 are complete and applied: data layer, authentication, all four Lambda-backed endpoints (enrichment, events, metrics, health), and API Gateway (OpenAPI spec, VTL mapping templates, v1/v2 stages, usage plans). Phase 5 (seed data, observability, setup documentation) is in progress; seed data is written, `modules/observability` still exists as an empty scaffold directory.

## Tech Stack Matrix

| Layer | Component | Technology | Purpose |
| --- | --- | --- | --- |
| IaC | Root config | Terraform (`~> 1.9.0`), AWS provider (`~> 6.0`), archive provider (`~> 2.4`) | Nested-module infrastructure, S3 remote state with native locking |
| Data | `accounts` table | DynamoDB, `PAY_PER_REQUEST`, hash key `account_id`, Streams enabled (`NEW_AND_OLD_IMAGES`) | Source of truth for account records; stream feeds the events pipeline |
| Data | `transactions` table | DynamoDB, `PAY_PER_REQUEST`, hash key `account_id`, range key `sk` | Per-account transaction history |
| Data | `consumer-registry` table | DynamoDB, `PAY_PER_REQUEST`, hash key `analyst_role` | Role-to-API-key mapping consulted by the authorizer |
| Data | `enrichment-cache` table | DynamoDB, `PAY_PER_REQUEST`, hash key `account_id`, TTL attribute `expires_at` | Caches AI-generated narratives for one hour to avoid repeat Bedrock calls |
| Auth | Identity provider | Auth0 (OIDC), custom Action injecting a `role` claim via Credentials Exchange | Issues JWTs consumed by the Lambda authorizer |
| Auth | `lambdas/authorizer` | Node.js 24.x, `aws-jwt-verify`, AWS SDK v3 (`client-dynamodb`, `lib-dynamodb`) | TOKEN-type Lambda authorizer: verifies JWT against Auth0 JWKS, resolves role to registry entry, returns Allow/Deny IAM policy |
| Compute | `lambdas/enrichment` | Node.js 24.x, AWS SDK v3 (`client-dynamodb`, `lib-dynamodb`, `client-ssm`, `client-bedrock-runtime`) | Fetches account and transaction data, generates an AI risk narrative via Bedrock, caches the result |
| Compute | `lambdas/events` (`subscribe.mjs`) | Node.js 24.x, AWS SDK v3 (`client-eventbridge`) | Registers analyst webhooks as EventBridge Connections, API Destinations, Rules, and Targets |
| Compute | `lambdas/events` (`stream-producer.mjs`) | Node.js 24.x, AWS SDK v3 (`client-eventbridge`) | Triggered by the `accounts` table's DynamoDB Stream; translates status-change records into EventBridge domain events |
| Compute | `lambdas/metrics` | Node.js 24.x, AWS SDK v3 (`client-dynamodb`, `lib-dynamodb`) | Full-table scan of `accounts`, aggregates portfolio totals and per-risk-band summaries |
| Compute | `lambdas/health` | Node.js 24.x, AWS SDK v3 (`client-dynamodb`, `client-bedrock`) | Parallel reachability check against DynamoDB and Bedrock, reports `200` or `503` |
| AI | Model | Amazon Bedrock, Anthropic Claude Haiku 4.5, US inference profile (`us.anthropic.claude-haiku-4-5-20251001-v1:0`) | Generates the enrichment narrative and risk action flag via the Converse API |
| AI | Prompt storage | SSM Parameter Store, Standard tier, `file()`-sourced from `docs/enrichment-prompt.txt` | Stores the enrichment prompt template outside application code; cached in-memory per warm Lambda container |
| Eventing | Event bus | Amazon EventBridge, custom bus (`debt-portfolio-api-<env>-bus`) | Central bus for account state-change events and analyst webhook delivery |
| Observability | Tracing | AWS X-Ray (`tracing_config { mode = "Active" }` on every Lambda) | Distributed tracing across all Lambda invocations |
| Observability | Logging | CloudWatch Logs via `AWSLambdaBasicExecutionRole` on every Lambda role | Default Lambda execution logging |

## Module Layout

```
modules/
  dynamodb/            # accounts, transactions, consumer-registry, enrichment-cache tables
  lambda_authorizer/    # authorizer Lambda, IAM role, Auth0-driven env vars
  lambda_enrichment/    # enrichment Lambda, SSM prompt parameter, Bedrock IAM policy
  lambda_events/        # subscribe + stream-producer Lambdas, EventBridge bus, stream event source mapping
  lambda_metrics/        # metrics Lambda, read-only IAM policy on accounts table
  lambda_health/         # health Lambda, DynamoDB + Bedrock reachability checks
  api_gateway/           # REST API imported from openapi/, DynamoDB direct-integration role, v1/v2 stages, usage plans
  observability/         # scaffolded, not yet implemented (Phase 5)
```

`scripts/seed-data.mjs` populates the accounts, transactions, and consumer-registry tables with mock data; see `scripts/README.md`. `openapi/` holds the OpenAPI spec and VTL mapping templates consumed by `modules/api_gateway`; see `openapi/README.md`.

Each Lambda's source lives under `lambdas/<name>/` with its own `README.md` documenting that function's step-by-step behavior; see those files for implementation detail beyond this matrix.

## Known Gaps / Out of Scope

- **Customer identity resolution.** This API's contract is `account_id`-only; there is no `customer_id`, `customer_name`, or `customer_ani` anywhere in the schema. Resolving a customer identifier to an `account_id` is an upstream responsibility; callers are expected to already hold the `account_id` before calling this API. This API will not add a customer-identity lookup (e.g., a GSI keyed on `customer_id`).

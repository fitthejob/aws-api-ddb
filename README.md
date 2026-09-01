# Debt Portfolio Intelligence API

Serverless REST API on AWS, built with Terraform, providing governed access to debt consolidation account and transaction data for internal analysts.

## Architecture

API Gateway REST API imported from `openapi/openapi.yaml`: direct DynamoDB integration (VTL) for simple reads (`accounts/{id}`, `accounts/{id}/transactions`), Lambda proxy integration for logic-bearing endpoints (enrichment via Bedrock, event subscription, metrics aggregation, health checks). A Lambda authorizer validates Auth0 JWTs on every protected route. See `docs/superpowers/specs/2026-08-31-debt-portfolio-intelligence-api-design.md` for the full design.

## Prerequisites

- Terraform >= 1.9.0
- AWS CLI configured with credentials for the target account
- Node.js 24.x, for running `scripts/seed-data.mjs` locally
- An S3 bucket for Terraform remote state, created manually, then set in `backend.tf`
- An Auth0 account (free tier is sufficient)

## Status

All 5 phases are complete and applied: data layer, authentication, all four Lambda-backed endpoints (enrichment, events, metrics, health), API Gateway (OpenAPI spec, VTL mapping templates, v1/v2 stages, usage plans), seed data, and the CloudWatch observability dashboard.

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
  observability/         # CloudWatch dashboard for API Gateway and enrichment Lambda metrics
```

`scripts/seed-data.mjs` populates the accounts, transactions, and consumer-registry tables with mock data; see `scripts/README.md`. `openapi/` holds the OpenAPI spec and VTL mapping templates consumed by `modules/api_gateway`; see `openapi/README.md`.

Each Lambda's source lives under `lambdas/<name>/` with its own `README.md` documenting that function's step-by-step behavior; see those files for implementation detail beyond this matrix.

## Setup

1. Create an Auth0 tenant, then an API (this defines the audience) and a Machine-to-Machine application for analyst/service auth. Add a custom Action on the Login/Credentials Exchange flow that injects a `role` claim (matching `auth0_role_claim`) onto issued tokens, set from the requesting client's metadata or a rule you define. Record the tenant domain and API audience; you will need both for `terraform.tfvars`.
2. Create `terraform.tfvars`:
   ```hcl
   auth0_domain   = "<your-tenant>.us.auth0.com"
   auth0_audience = "<your-api-audience>"
   ```
3. Update `backend.tf` with your state bucket name.
4. `terraform init`
5. `terraform validate` and `terraform plan`; review carefully.
6. `terraform apply`
7. Seed data:
   ```bash
   cd scripts && npm install
   ACCOUNTS_TABLE_NAME=$(terraform output -raw accounts_table_name) \
   TRANSACTIONS_TABLE_NAME=$(terraform output -raw transactions_table_name) \
   CONSUMER_REGISTRY_TABLE_NAME=$(terraform output -raw consumer_registry_table_name) \
   AWS_REGION=<your-region> \
   node seed-data.mjs
   cd ..
   ```
8. Get a test JWT from Auth0 for your Machine-to-Machine application, scoped to the API audience from step 1.
9. Get your API key for a role:
   ```bash
   terraform output -raw api_key_values
   ```
10. Test:
    ```bash
    curl -H "Authorization: Bearer <JWT>" \
         -H "x-api-key: <API_KEY>" \
         "$(terraform output -raw v2_invoke_url)accounts/<account_id>"
    ```

## Consumer Registry

Analyst roles and their per-role rate limits are defined in `variables.tf` under `consumer_registry_seed` and mirrored into the `consumer-registry` DynamoDB table by the seed script. Terraform generates one API Gateway usage plan and API key per role from this variable at apply time; the table itself is not read live by API Gateway. To add a role: add an entry to `consumer_registry_seed` in `terraform.tfvars`, add a matching entry to the `roles` array in `scripts/seed-data.mjs`, run `terraform apply`, then re-run the seed script.

## Versioning Strategy

`v1` and `v2` are separate API Gateway stages sharing one REST API and one set of Lambda backends. `v1` returns the original flat response shape and carries `Sunset`/`Deprecation` response headers on the DynamoDB-backed and metrics routes; `v2` wraps the DynamoDB-backed responses in a `{ "data": {...} }` envelope and carries neither header. Version status is documented at `GET /meta/versions`. Consult that endpoint before building against `v1`; it is deprecated as of this project's initial release.

## Known Gaps / Out of Scope

- **Customer identity resolution.** This API's contract is `account_id`-only; there is no `customer_id`, `customer_name`, or `customer_ani` anywhere in the schema. Resolving a customer identifier to an `account_id` is an upstream responsibility; callers are expected to already hold the `account_id` before calling this API. This API will not add a customer-identity lookup (e.g., a GSI keyed on `customer_id`).
- No field-level or per-account authorization; the JWT role claim gates endpoint access only, not which specific accounts a given analyst may read.
- Webhook subscription validation (`lambdas/events/subscribe.mjs`) is a basic SSRF guard (HTTPS enforcement plus private/loopback IP rejection at registration time), not production-hardened; see the TODO in that file for the residual DNS-rebinding gap.
- No automated test suite.

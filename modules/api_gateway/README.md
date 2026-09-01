# API Gateway Module

1. The REST API is not built resource-by-resource in Terraform; it is imported wholesale from `openapi/openapi.yaml` via `body = local.rendered_openapi`. The `templatefile()` call in `main.tf` resolves that spec's `${...}` markers, including the five VTL template bodies under `openapi/templates/`, which are read with `file()` and passed in as JSON-encoded strings. See `openapi/README.md` for what each route and template does; this module only wires values into it.

2. `/v1/accounts/{id}` and `/v1/accounts/{id}/transactions` (and their `/v2` equivalents) integrate directly with DynamoDB, no Lambda in between. That requires the `aws_iam_role.api_gateway_dynamodb` role, assumed by `apigateway.amazonaws.com`, scoped to `GetItem`/`Query` on the accounts and transactions tables. Its ARN is passed into the spec as `api_gateway_dynamodb_role_arn`, used as the `credentials` field on those two integrations.

3. The other routes (`enriched`, `events/subscribe`, `portfolio/metrics`, `/health`) proxy to their Lambdas. Each one needs a matching `aws_lambda_permission` here granting `apigateway.amazonaws.com` permission to invoke it; the invoke ARNs themselves are passed into the spec as `${..._lambda_invoke_arn}` markers.

4. The JWT authorizer is defined inside `openapi.yaml` itself, under `components.securitySchemes.jwtAuthorizer`, not as a separate `aws_api_gateway_authorizer` resource. Since the whole API is imported from the spec body, defining it there is the only way to avoid a duplicate or conflicting authorizer definition. This module only supplies `authorizer_lambda_invoke_arn` and grants the authorizer Lambda's invoke permission, scoped to `.../authorizers/*` since Terraform has no direct reference to the authorizer's generated ID.

5. `aws_api_gateway_deployment.this` redeploys whenever `local.rendered_openapi` changes, tracked via a `sha1` trigger; `create_before_destroy` avoids a gap in availability during redeployment.

6. Two stages exist, `v1` and `v2`, both pointing at the same deployment; the spec's route paths (`/v1/...` vs `/v2/...`) are what actually separate the two API versions, not the stages. Both stages set `accountsTableName`/`transactionsTableName` as stage variables, referenced by the VTL request templates (`$stageVariables.accountsTableName`, `$stageVariables.transactionsTableName`) to avoid hardcoding table names into the templates themselves.

7. Usage plans, API keys, and usage plan keys are all created per entry in `var.consumer_registry_seed` (one plan per analyst role, each covering both stages), with throttle limits read from that same map. Each plan gets one API key.

# OpenAPI Spec and VTL Templates

## `openapi.yaml`

The single source-of-truth API definition, imported by API Gateway (Task 4.3) via `x-amazon-apigateway-integration` extensions. Defines every route across both API versions, plus the version-metadata and health endpoints.

- `/v1/*` routes: the original API surface. `accounts/{id}` and `accounts/{id}/transactions` integrate directly with DynamoDB (no Lambda) via VTL request/response templates; `portfolio/metrics`, `accounts/{id}/enriched`, and `events/subscribe` proxy to their respective Lambdas. All v1 routes carry `Sunset`/`Deprecation` response headers.
- `/v2/*` routes: the current API surface, mirroring v1's paths. The DynamoDB-integrated routes use a different response template (`strip-ddb-response-v2.vtl`) that wraps the account payload in a `{ "data": {...} }` envelope; the Lambda-backed routes are unchanged from v1.
- `/meta/versions`: a mock integration (no backend call) that returns a static JSON payload describing each version's status and sunset date.
- `/health`: proxies to the health Lambda.

Region- and account-specific values (Lambda invoke ARNs, the API Gateway DynamoDB execution role, the VTL template bodies themselves) are left as `${...}` interpolation markers, resolved by Terraform's `templatefile()` when this spec is imported in Task 4.3.

## `templates/`

VTL (Velocity Template Language) request and response mapping templates used by the direct-DynamoDB integrations in `openapi.yaml`. These let API Gateway talk to DynamoDB without a Lambda in between, translating REST-shaped requests into DynamoDB API calls and translating DynamoDB's raw attribute-typed responses back into plain JSON.

- `get-account-request.vtl`: builds a DynamoDB `GetItem` request body for `/v1/accounts/{id}` and `/v2/accounts/{id}`, keyed on the `id` path parameter.
- `get-transactions-request.vtl`: builds a DynamoDB `Query` request body for `/v1/accounts/{id}/transactions` and `/v2/accounts/{id}/transactions`, keyed on the same `id` path parameter.
- `strip-ddb-response.vtl`: the v1 response template for a single account. Strips DynamoDB's attribute-type wrappers (e.g. `{"S": "..."}`) off a `GetItem` result and returns a flat JSON object.
- `strip-ddb-response-v2.vtl`: the v2 equivalent of the above, wrapping the same flattened fields in a `{ "data": {...} }` envelope to realize v2's normalized response shape.
- `strip-ddb-list-response.vtl`: the response template for a transaction history `Query` result. Iterates the returned `Items` array and flattens each transaction's DynamoDB attribute types into plain JSON.

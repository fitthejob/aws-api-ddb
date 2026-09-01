# Authorizer Lambda

`GET/POST *` (API Gateway TOKEN-type Lambda authorizer, invoked before every protected endpoint)

1. Read the `Authorization` header from `event.authorizationToken`, and strip the `Bearer ` prefix. If it is missing, throw `Unauthorized`; API Gateway turns this into a `401`.
2. Verify the JWT (`verifier.verify(token)`) against Auth0's JWKS. This checks signature, issuer, audience, and expiry. If verification fails for any reason, throw `Unauthorized`, producing the same `401` outcome. The specific failure reason is deliberately not leaked back to the caller.
3. Extract the custom role claim (`https://debt-portfolio-api/role`) from the verified token payload. If it is missing, throw `Unauthorized`; a validly-signed token with no role claim still cannot be authorized against anything.
4. Look up that role in the `consumer-registry` table (`GetItem` on `analyst_role`). If no matching item exists, return an explicit `Deny` IAM policy. This produces a `403 Forbidden` from API Gateway, since the identity is valid but not permitted; this is distinct from the `401`s above, where the identity itself is unverifiable.
5. If the role is registered, return an `Allow` IAM policy for the requested method ARN, with `role` and `usageIdentifierKey` attached in `context`. This is passed through to the backend as `$context.authorizer.*`, letting the actual request enforce role-based throttling via the matching API Gateway usage plan.

**401 vs 403 distinction:** throwing an `Error` (steps 1 through 3) signals that the caller's identity could not be established, resulting in a `401`. Returning a `Deny` policy (step 4) signals that the identity is known but not authorized, resulting in a `403`. This is standard REST semantics, driven entirely by how the function communicates failure back to API Gateway.

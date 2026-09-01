import { before, beforeEach, mock, test } from "node:test";
import assert from "node:assert";
import { mockClient } from "aws-sdk-client-mock";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";

process.env.AUTH0_DOMAIN = "test-tenant.us.auth0.com";
process.env.AUTH0_AUDIENCE = "test-audience";
process.env.AUTH0_JWKS_URL = "https://test-tenant.us.auth0.com/.well-known/jwks.json";
process.env.AUTH0_ROLE_CLAIM = "https://debt-portfolio-api/role";
process.env.CONSUMER_REGISTRY_TABLE_NAME = "consumer-registry";

let verifyMock;

before(() => {
  verifyMock = mock.fn();
  mock.module("aws-jwt-verify", {
    exports: {
      JwtRsaVerifier: {
        create: () => ({ verify: verifyMock }),
      },
    },
  });
});

const { handler } = await import("./index.mjs");

const ddbMock = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
  ddbMock.reset();
  verifyMock.mock.resetCalls();
});

test("throws Unauthorized when no authorizationToken is present", async () => {
  await assert.rejects(
    () => handler({ authorizationToken: "", methodArn: "arn:test" }),
    /Unauthorized/,
  );
});

test("throws Unauthorized when token verification fails", async () => {
  verifyMock.mock.mockImplementationOnce(() => {
    throw new Error("invalid signature");
  });

  await assert.rejects(
    () =>
      handler({
        authorizationToken: "Bearer bad-token",
        methodArn: "arn:test",
      }),
    /Unauthorized/,
  );
});

test("throws Unauthorized when role claim is missing", async () => {
  verifyMock.mock.mockImplementationOnce(() => ({ sub: "user-1" }));

  await assert.rejects(
    () =>
      handler({
        authorizationToken: "Bearer good-token",
        methodArn: "arn:test",
      }),
    /Unauthorized/,
  );
});

test("returns Deny policy when role has no registry entry", async () => {
  verifyMock.mock.mockImplementationOnce(() => ({
    sub: "user-1",
    "https://debt-portfolio-api/role": "unknown-role",
  }));
  ddbMock.on(GetCommand).resolves({ Item: undefined });

  const result = await handler({
    authorizationToken: "Bearer good-token",
    methodArn: "arn:test",
  });

  assert.strictEqual(result.principalId, "user-1");
  assert.strictEqual(result.policyDocument.Statement[0].Effect, "Deny");
});

test("returns Allow policy with role and usageIdentifierKey context when registry entry exists", async () => {
  verifyMock.mock.mockImplementationOnce(() => ({
    sub: "user-1",
    "https://debt-portfolio-api/role": "senior-analyst",
  }));
  ddbMock.on(GetCommand).resolves({
    Item: { analyst_role: "senior-analyst", api_key_value: "key-123" },
  });

  const result = await handler({
    authorizationToken: "Bearer good-token",
    methodArn: "arn:test",
  });

  assert.strictEqual(result.principalId, "user-1");
  assert.strictEqual(result.policyDocument.Statement[0].Effect, "Allow");
  assert.strictEqual(result.policyDocument.Statement[0].Resource, "arn:test");
  assert.strictEqual(result.context.role, "senior-analyst");
  assert.strictEqual(result.context.usageIdentifierKey, "key-123");
});

test("defaults usageIdentifierKey to empty string when registry entry has no api_key_value", async () => {
  verifyMock.mock.mockImplementationOnce(() => ({
    sub: "user-1",
    "https://debt-portfolio-api/role": "read-only-analyst",
  }));
  ddbMock.on(GetCommand).resolves({
    Item: { analyst_role: "read-only-analyst" },
  });

  const result = await handler({
    authorizationToken: "Bearer good-token",
    methodArn: "arn:test",
  });

  assert.strictEqual(result.context.usageIdentifierKey, "");
});

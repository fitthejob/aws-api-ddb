import { before, beforeEach, mock, test } from "node:test";
import assert from "node:assert";
import { mockClient } from "aws-sdk-client-mock";
import {
  EventBridgeClient,
  CreateConnectionCommand,
  CreateApiDestinationCommand,
  PutRuleCommand,
  PutTargetsCommand,
} from "@aws-sdk/client-eventbridge";

process.env.EVENT_BUS_NAME = "debt-portfolio-bus";
process.env.EVENTBRIDGE_INVOKE_ROLE_ARN = "arn:aws:iam::123456789012:role/invoke-destination";

let lookupMock;

before(() => {
  lookupMock = mock.fn(async () => [{ address: "93.184.216.34" }]);
  mock.module("node:dns/promises", {
    exports: { lookup: lookupMock },
  });
});

const { handler } = await import("./subscribe.mjs");

const eventBridgeMock = mockClient(EventBridgeClient);

beforeEach(() => {
  eventBridgeMock.reset();
  lookupMock.mock.resetCalls();
  lookupMock.mock.mockImplementation(async () => [{ address: "93.184.216.34" }]);
});

test("returns 400 when webhook_url is missing", async () => {
  const result = await handler({ body: JSON.stringify({}) });
  assert.strictEqual(result.statusCode, 400);
});

test("returns 400 when webhook_url is not https", async () => {
  const result = await handler({ body: JSON.stringify({ webhook_url: "http://example.com/hook" }) });
  assert.strictEqual(result.statusCode, 400);

  // The protocol check must short-circuit before the DNS lookup; if a
  // refactor moved the lookup earlier, this suite should catch the
  // ordering change rather than only the status code.
  assert.strictEqual(lookupMock.mock.callCount(), 0);
});

test("returns 400 when webhook_url hostname is localhost", async () => {
  const result = await handler({ body: JSON.stringify({ webhook_url: "https://localhost/hook" }) });
  assert.strictEqual(result.statusCode, 400);
});

test("returns 400 when webhook_url resolves to a private IP", async () => {
  lookupMock.mock.mockImplementation(async () => [{ address: "10.0.0.5" }]);

  const result = await handler({ body: JSON.stringify({ webhook_url: "https://internal.example.com/hook" }) });
  assert.strictEqual(result.statusCode, 400);
});

test("returns 400 when webhook_url resolves to an IPv6 unique-local address", async () => {
  lookupMock.mock.mockImplementation(async () => [{ address: "fc00::1" }]);

  const result = await handler({ body: JSON.stringify({ webhook_url: "https://internal-v6.example.com/hook" }) });
  assert.strictEqual(result.statusCode, 400);
});

test("returns 400 when webhook_url resolves to an IPv6 link-local address", async () => {
  lookupMock.mock.mockImplementation(async () => [{ address: "fe80::1" }]);

  const result = await handler({ body: JSON.stringify({ webhook_url: "https://internal-v6.example.com/hook" }) });
  assert.strictEqual(result.statusCode, 400);
});

test("returns 400 when any one of multiple resolved addresses is private", async () => {
  lookupMock.mock.mockImplementation(async () => [
    { address: "93.184.216.34" },
    { address: "10.0.0.5" },
  ]);

  const result = await handler({ body: JSON.stringify({ webhook_url: "https://multi-homed.example.com/hook" }) });
  assert.strictEqual(result.statusCode, 400);
});

test("returns 400 when DNS lookup fails", async () => {
  lookupMock.mock.mockImplementation(async () => {
    throw new Error("ENOTFOUND");
  });

  const result = await handler({ body: JSON.stringify({ webhook_url: "https://nonexistent.example.com/hook" }) });
  assert.strictEqual(result.statusCode, 400);
});

test("creates connection, destination, rule, and target for a valid webhook_url", async () => {
  eventBridgeMock.on(CreateConnectionCommand).resolves({ ConnectionArn: "arn:connection" });
  eventBridgeMock.on(CreateApiDestinationCommand).resolves({ ApiDestinationArn: "arn:destination" });
  eventBridgeMock.on(PutRuleCommand).resolves({ RuleArn: "arn:rule" });
  eventBridgeMock.on(PutTargetsCommand).resolves({ FailedEntryCount: 0 });

  const result = await handler({ body: JSON.stringify({ webhook_url: "https://example.com/hook" }) });
  const body = JSON.parse(result.body);

  assert.strictEqual(result.statusCode, 200);
  assert.strictEqual(body.rule_arn, "arn:rule");
  assert.ok(body.subscription_id);

  const targetCalls = eventBridgeMock.commandCalls(PutTargetsCommand);
  assert.strictEqual(targetCalls.length, 1);
  assert.strictEqual(
    targetCalls[0].args[0].input.Targets[0].RoleArn,
    "arn:aws:iam::123456789012:role/invoke-destination",
  );
  assert.strictEqual(targetCalls[0].args[0].input.Targets[0].Arn, "arn:destination");

  const connectionCalls = eventBridgeMock.commandCalls(CreateConnectionCommand);
  assert.strictEqual(connectionCalls.length, 1);
  assert.strictEqual(connectionCalls[0].args[0].input.AuthorizationType, "API_KEY");
  assert.strictEqual(
    connectionCalls[0].args[0].input.AuthParameters.ApiKeyAuthParameters.ApiKeyValue,
    body.subscription_id,
  );

  const destinationCalls = eventBridgeMock.commandCalls(CreateApiDestinationCommand);
  assert.strictEqual(destinationCalls.length, 1);
  assert.strictEqual(destinationCalls[0].args[0].input.InvocationEndpoint, "https://example.com/hook");
  assert.strictEqual(destinationCalls[0].args[0].input.ConnectionArn, "arn:connection");
  assert.strictEqual(destinationCalls[0].args[0].input.HttpMethod, "POST");
});

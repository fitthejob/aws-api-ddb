import { beforeEach, test } from "node:test";
import assert from "node:assert";
import { mockClient } from "aws-sdk-client-mock";
import { DynamoDBDocumentClient, GetCommand, QueryCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";

process.env.ENRICHMENT_CACHE_TABLE_NAME = "enrichment-cache";
process.env.ACCOUNTS_TABLE_NAME = "accounts";
process.env.TRANSACTIONS_TABLE_NAME = "transactions";
process.env.PROMPT_PARAM_NAME = "/debt-portfolio/prompt";
process.env.BEDROCK_MODEL_ID = "test-model";

const { handler } = await import("./index.mjs");

const ddbMock = mockClient(DynamoDBDocumentClient);
const ssmMock = mockClient(SSMClient);
const bedrockMock = mockClient(BedrockRuntimeClient);

const account = {
  account_id: "acc-1",
  balance: 1000,
  status: "active",
  risk_band: "medium",
  product_type: "settlement-plan",
};

beforeEach(() => {
  ddbMock.reset();
  ssmMock.reset();
  bedrockMock.reset();
  ssmMock.on(GetParameterCommand).resolves({
    Parameter: { Value: "Account: [[account]] Transactions: [[transactions]]" },
  });
});

test("returns 400 when path account id is missing", async () => {
  const result = await handler({ pathParameters: {} });
  assert.strictEqual(result.statusCode, 400);
});

test("returns cached narrative on a fresh cache hit without calling Bedrock", async () => {
  ddbMock.on(GetCommand, { TableName: "enrichment-cache" }).resolves({
    Item: {
      account_id: "acc-1",
      narrative: "cached narrative",
      action_flag: "monitor",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    },
  });

  const result = await handler({ pathParameters: { id: "acc-1" } });
  const body = JSON.parse(result.body);

  assert.strictEqual(result.statusCode, 200);
  assert.strictEqual(body.narrative, "cached narrative");
  assert.strictEqual(body.cached, true);
  assert.strictEqual(bedrockMock.calls().length, 0);
});

test("returns 404 when account does not exist on a cache miss", async () => {
  ddbMock.on(GetCommand, { TableName: "enrichment-cache" }).resolves({ Item: undefined });
  ddbMock.on(GetCommand, { TableName: "accounts" }).resolves({ Item: undefined });

  const result = await handler({ pathParameters: { id: "acc-missing" } });
  assert.strictEqual(result.statusCode, 404);
});

test("generates a narrative via Bedrock and writes it to cache on success", async () => {
  ddbMock.on(GetCommand, { TableName: "enrichment-cache" }).resolves({ Item: undefined });
  ddbMock.on(GetCommand, { TableName: "accounts" }).resolves({ Item: account });
  ddbMock.on(QueryCommand).resolves({ Items: [] });
  ddbMock.on(PutCommand).resolves({});
  bedrockMock.on(ConverseCommand).resolves({
    output: {
      message: {
        content: [{ text: JSON.stringify({ narrative: "at risk", action_flag: "escalate" }) }],
      },
    },
  });

  const result = await handler({ pathParameters: { id: "acc-1" } });
  const body = JSON.parse(result.body);

  assert.strictEqual(result.statusCode, 200);
  assert.strictEqual(body.narrative, "at risk");
  assert.strictEqual(body.action_flag, "escalate");
  assert.strictEqual(body.cached, false);

  const putCalls = ddbMock.commandCalls(PutCommand);
  assert.strictEqual(putCalls.length, 1);
  assert.strictEqual(putCalls[0].args[0].input.Item.narrative, "at risk");
});

test("degrades gracefully with null narrative when Bedrock returns no text", async () => {
  ddbMock.on(GetCommand, { TableName: "enrichment-cache" }).resolves({ Item: undefined });
  ddbMock.on(GetCommand, { TableName: "accounts" }).resolves({ Item: account });
  ddbMock.on(QueryCommand).resolves({ Items: [] });
  bedrockMock.on(ConverseCommand).resolves({ output: { message: { content: [] } } });

  const result = await handler({ pathParameters: { id: "acc-1" } });
  const body = JSON.parse(result.body);

  assert.strictEqual(result.statusCode, 200);
  assert.strictEqual(result.headers["x-enrichment-status"], "degraded");
  assert.strictEqual(body.narrative, null);
  assert.strictEqual(body.action_flag, null);
});

test("degrades gracefully when Bedrock response is missing narrative or action_flag", async () => {
  ddbMock.on(GetCommand, { TableName: "enrichment-cache" }).resolves({ Item: undefined });
  ddbMock.on(GetCommand, { TableName: "accounts" }).resolves({ Item: account });
  ddbMock.on(QueryCommand).resolves({ Items: [] });
  bedrockMock.on(ConverseCommand).resolves({
    output: { message: { content: [{ text: JSON.stringify({ narrative: "partial" }) }] } },
  });

  const result = await handler({ pathParameters: { id: "acc-1" } });
  const body = JSON.parse(result.body);

  assert.strictEqual(result.headers["x-enrichment-status"], "degraded");
  assert.strictEqual(body.narrative, null);

  const putCalls = ddbMock.commandCalls(PutCommand);
  assert.strictEqual(putCalls.length, 0);
});

test("degrades gracefully when Bedrock call throws", async () => {
  ddbMock.on(GetCommand, { TableName: "enrichment-cache" }).resolves({ Item: undefined });
  ddbMock.on(GetCommand, { TableName: "accounts" }).resolves({ Item: account });
  ddbMock.on(QueryCommand).resolves({ Items: [] });
  bedrockMock.on(ConverseCommand).rejects(new Error("Bedrock unavailable"));

  const result = await handler({ pathParameters: { id: "acc-1" } });
  const body = JSON.parse(result.body);

  assert.strictEqual(result.statusCode, 200);
  assert.strictEqual(result.headers["x-enrichment-status"], "degraded");
  assert.strictEqual(body.account.account_id, "acc-1");
});

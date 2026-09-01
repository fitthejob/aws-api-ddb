import { beforeEach, test } from "node:test";
import assert from "node:assert";
import { mockClient } from "aws-sdk-client-mock";
import { DynamoDBClient, DescribeTableCommand } from "@aws-sdk/client-dynamodb";
import { BedrockClient, ListFoundationModelsCommand } from "@aws-sdk/client-bedrock";

process.env.ACCOUNTS_TABLE_NAME = "accounts";

const { handler } = await import("./index.mjs");

const ddbMock = mockClient(DynamoDBClient);
const bedrockMock = mockClient(BedrockClient);

beforeEach(() => {
  ddbMock.reset();
  bedrockMock.reset();
});

test("returns 200 with both dependencies reachable", async () => {
  ddbMock.on(DescribeTableCommand).resolves({ Table: { TableName: "accounts" } });
  bedrockMock.on(ListFoundationModelsCommand).resolves({ modelSummaries: [] });

  const result = await handler();
  const body = JSON.parse(result.body);

  assert.strictEqual(result.statusCode, 200);
  assert.strictEqual(body.dynamodb, "reachable");
  assert.strictEqual(body.bedrock, "reachable");
});

test("returns 503 when DynamoDB is unreachable", async () => {
  ddbMock.on(DescribeTableCommand).rejects(new Error("connection refused"));
  bedrockMock.on(ListFoundationModelsCommand).resolves({ modelSummaries: [] });

  const result = await handler();
  const body = JSON.parse(result.body);

  assert.strictEqual(result.statusCode, 503);
  assert.strictEqual(body.dynamodb, "unreachable");
  assert.strictEqual(body.bedrock, "reachable");
});

test("returns 503 when Bedrock is unreachable", async () => {
  ddbMock.on(DescribeTableCommand).resolves({ Table: { TableName: "accounts" } });
  bedrockMock.on(ListFoundationModelsCommand).rejects(new Error("access denied"));

  const result = await handler();
  const body = JSON.parse(result.body);

  assert.strictEqual(result.statusCode, 503);
  assert.strictEqual(body.bedrock, "unreachable");
});

test("returns 503 when both dependencies are unreachable", async () => {
  ddbMock.on(DescribeTableCommand).rejects(new Error("timeout"));
  bedrockMock.on(ListFoundationModelsCommand).rejects(new Error("timeout"));

  const result = await handler();
  const body = JSON.parse(result.body);

  assert.strictEqual(result.statusCode, 503);
  assert.strictEqual(body.dynamodb, "unreachable");
  assert.strictEqual(body.bedrock, "unreachable");
});

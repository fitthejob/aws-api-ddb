import { after, before, test } from "node:test";
import assert from "node:assert";
import { mock } from "node:test";
import { mockClient } from "aws-sdk-client-mock";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";

process.env.ACCOUNTS_TABLE_NAME = "accounts";

const { handler } = await import("./index.mjs");

const ddbMock = mockClient(DynamoDBDocumentClient);

// The handler caches its response in a module-level variable, keyed off
// Date.now(), for a 60-second TTL, with no external reset hook. Date is
// mocked here so the TTL can be genuinely exercised (both hit and expiry)
// without a real 60-second sleep between tests.

before(() => {
  mock.timers.enable({ apis: ["Date"] });
});

after(() => {
  mock.timers.reset();
});

test("aggregates accounts by risk band on the first (uncached) call", async () => {
  ddbMock.on(ScanCommand).resolves({
    Items: [
      { account_id: "a1", balance: 100, risk_band: "low" },
      { account_id: "a2", balance: 300, risk_band: "low" },
      { account_id: "a3", balance: 500, risk_band: "high" },
    ],
  });

  const result = await handler();
  const body = JSON.parse(result.body);

  assert.strictEqual(result.statusCode, 200);
  assert.strictEqual(body.total_accounts, 3);
  assert.strictEqual(body.total_balance, 900);
  assert.strictEqual(body.by_risk_band.low.count, 2);
  assert.strictEqual(body.by_risk_band.low.avg_balance, 200);
  assert.strictEqual(body.by_risk_band.high.count, 1);
  assert.strictEqual(ddbMock.commandCalls(ScanCommand).length, 1);
});

test("returns the cached response within the TTL window without re-scanning", async () => {
  ddbMock.reset();
  ddbMock.on(ScanCommand).resolves({
    Items: [{ account_id: "z1", balance: 999, risk_band: "severe" }],
  });

  mock.timers.tick(30_000);

  const result = await handler();
  const body = JSON.parse(result.body);

  // Asserts the full cached payload, not just total_accounts, so a
  // regression that recomputes part of the response from the new (stale)
  // Scan mock while reusing the rest of cachedResponse would be caught.
  assert.strictEqual(body.total_accounts, 3);
  assert.strictEqual(body.total_balance, 900);
  assert.strictEqual(body.by_risk_band.low.count, 2);
  assert.strictEqual(body.by_risk_band.low.avg_balance, 200);
  assert.strictEqual(body.by_risk_band.high.count, 1);
  assert.strictEqual(body.by_risk_band.severe, undefined);
  assert.strictEqual(ddbMock.commandCalls(ScanCommand).length, 0);
});

test("re-scans once the TTL has expired", async () => {
  ddbMock.reset();
  ddbMock
    .on(ScanCommand)
    .resolvesOnce({
      Items: [{ account_id: "b1", balance: 50, risk_band: "medium" }],
      LastEvaluatedKey: { account_id: "b1" },
    })
    .resolvesOnce({
      Items: [{ account_id: "b2", balance: 150, risk_band: "medium" }],
    });

  mock.timers.tick(31_000);

  const result = await handler();
  const body = JSON.parse(result.body);

  assert.strictEqual(body.total_accounts, 2);
  assert.strictEqual(body.by_risk_band.medium.count, 2);
  assert.strictEqual(body.by_risk_band.medium.avg_balance, 100);

  const scanCalls = ddbMock.commandCalls(ScanCommand);
  assert.strictEqual(scanCalls.length, 2);
  assert.strictEqual(scanCalls[1].args[0].input.ExclusiveStartKey.account_id, "b1");
});

test("treats accounts with no risk_band as unknown", async () => {
  ddbMock.reset();
  ddbMock.on(ScanCommand).resolves({
    Items: [{ account_id: "c1", balance: 100 }],
  });

  mock.timers.tick(61_000);

  const result = await handler();
  const body = JSON.parse(result.body);

  assert.strictEqual(body.by_risk_band.unknown.count, 1);
  assert.strictEqual(body.by_risk_band.unknown.avg_balance, 100);
});

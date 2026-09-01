import { beforeEach, test } from "node:test";
import assert from "node:assert";
import { mockClient } from "aws-sdk-client-mock";
import { EventBridgeClient, PutEventsCommand } from "@aws-sdk/client-eventbridge";

process.env.EVENT_BUS_NAME = "debt-portfolio-bus";

const { handler } = await import("./stream-producer.mjs");

const eventBridgeMock = mockClient(EventBridgeClient);

beforeEach(() => {
  eventBridgeMock.reset();
});

test("publishes no events when Records is empty", async () => {
  await handler({ Records: [] });
  assert.strictEqual(eventBridgeMock.calls().length, 0);
});

test("ignores non-MODIFY records", async () => {
  await handler({
    Records: [{ eventName: "INSERT", dynamodb: { Keys: { account_id: { S: "acc-1" } } } }],
  });
  assert.strictEqual(eventBridgeMock.calls().length, 0);
});

test("ignores MODIFY records where status did not change", async () => {
  await handler({
    Records: [
      {
        eventName: "MODIFY",
        dynamodb: {
          Keys: { account_id: { S: "acc-1" } },
          OldImage: { status: { S: "active" } },
          NewImage: { status: { S: "active" } },
        },
      },
    ],
  });
  assert.strictEqual(eventBridgeMock.calls().length, 0);
});

test("publishes an Account State Change event when status changes", async () => {
  eventBridgeMock.on(PutEventsCommand).resolves({ FailedEntryCount: 0 });

  await handler({
    Records: [
      {
        eventName: "MODIFY",
        dynamodb: {
          Keys: { account_id: { S: "acc-1" } },
          OldImage: { status: { S: "active" } },
          NewImage: { status: { S: "delinquent" } },
        },
      },
    ],
  });

  const calls = eventBridgeMock.commandCalls(PutEventsCommand);
  assert.strictEqual(calls.length, 1);

  const entry = calls[0].args[0].input.Entries[0];
  assert.strictEqual(entry.Source, "debt-portfolio.accounts");
  assert.strictEqual(entry.DetailType, "Account State Change");

  const detail = JSON.parse(entry.Detail);
  assert.strictEqual(detail.account_id, "acc-1");
  assert.strictEqual(detail.old_status, "active");
  assert.strictEqual(detail.new_status, "delinquent");
});

test("batches multiple qualifying records into one PutEvents call", async () => {
  eventBridgeMock.on(PutEventsCommand).resolves({ FailedEntryCount: 0 });

  await handler({
    Records: [
      {
        eventName: "MODIFY",
        dynamodb: {
          Keys: { account_id: { S: "acc-1" } },
          OldImage: { status: { S: "active" } },
          NewImage: { status: { S: "delinquent" } },
        },
      },
      {
        eventName: "MODIFY",
        dynamodb: {
          Keys: { account_id: { S: "acc-2" } },
          OldImage: { status: { S: "delinquent" } },
          NewImage: { status: { S: "settled" } },
        },
      },
    ],
  });

  const calls = eventBridgeMock.commandCalls(PutEventsCommand);
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].args[0].input.Entries.length, 2);
});

test("skips a status-changing record with missing Keys instead of throwing", async () => {
  eventBridgeMock.on(PutEventsCommand).resolves({ FailedEntryCount: 0 });

  await assert.doesNotReject(() =>
    handler({
      Records: [
        {
          eventName: "MODIFY",
          dynamodb: {
            OldImage: { status: { S: "active" } },
            NewImage: { status: { S: "delinquent" } },
          },
        },
        {
          eventName: "MODIFY",
          dynamodb: {
            Keys: { account_id: { S: "acc-2" } },
            OldImage: { status: { S: "active" } },
            NewImage: { status: { S: "delinquent" } },
          },
        },
      ],
    }),
  );

  const calls = eventBridgeMock.commandCalls(PutEventsCommand);
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].args[0].input.Entries.length, 1);
  assert.strictEqual(
    JSON.parse(calls[0].args[0].input.Entries[0].Detail).account_id,
    "acc-2",
  );
});

test("does not throw when PutEvents reports partial failures", async () => {
  eventBridgeMock.on(PutEventsCommand).resolves({
    FailedEntryCount: 1,
    Entries: [{ ErrorCode: "InternalFailure" }],
  });

  await assert.doesNotReject(() =>
    handler({
      Records: [
        {
          eventName: "MODIFY",
          dynamodb: {
            Keys: { account_id: { S: "acc-1" } },
            OldImage: { status: { S: "active" } },
            NewImage: { status: { S: "delinquent" } },
          },
        },
      ],
    }),
  );
});

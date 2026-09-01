import {
  EventBridgeClient,
  PutEventsCommand,
} from "@aws-sdk/client-eventbridge";

const eventBridge = new EventBridgeClient({});

export const handler = async (event) => {
  const entries = [];

  for (const record of event.Records) {
    if (record.eventName !== "MODIFY" || !record.dynamodb) continue;

    const oldStatus = record.dynamodb.OldImage?.status?.S;
    const newStatus = record.dynamodb.NewImage?.status?.S;
    const accountId = record.dynamodb.Keys?.account_id?.S;

    if (oldStatus && newStatus && accountId && oldStatus !== newStatus) {
      entries.push({
        Source: "debt-portfolio.accounts",
        DetailType: "Account State Change",
        EventBusName: process.env.EVENT_BUS_NAME,
        Detail: JSON.stringify({
          account_id: accountId,
          old_status: oldStatus,
          new_status: newStatus,
        }),
      });
    }
  }

  if (entries.length > 0) {
    const result = await eventBridge.send(
      new PutEventsCommand({ Entries: entries }),
    );

    if (result.FailedEntryCount > 0) {
      // TODO: no retry or DLQ for partially failed EventBridge publishes;
      // failed entries are logged but otherwise dropped.
      console.error(
        `${result.FailedEntryCount} of ${entries.length} events failed to publish:`,
        JSON.stringify(result.Entries),
      );
    }
  }
};

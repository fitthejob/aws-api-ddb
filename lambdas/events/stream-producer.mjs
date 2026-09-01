import {
  EventBridgeClient,
  PutEventsCommand,
} from "@aws-sdk/client-eventbridge";

const eventBridge = new EventBridgeClient({});

export const handler = async (event) => {
  const entries = [];

  for (const record of event.Records) {
    if (record.eventName !== "MODIFY") continue;

    const oldStatus = record.dynamodb.OldImage?.status?.S;
    const newStatus = record.dynamodb.NewImage?.status?.S;

    if (oldStatus && newStatus && oldStatus !== newStatus) {
      entries.push({
        Source: "debt-portfolio.accounts",
        DetailType: "Account State Change",
        EventBusName: process.env.EVENT_BUS_NAME,
        Detail: JSON.stringify({
          account_id: record.dynamodb.Keys.account_id.S,
          old_status: oldStatus,
          new_status: newStatus,
        }),
      });
    }
  }

  if (entries.length > 0) {
    await eventBridge.send(new PutEventsCommand({ Entries: entries }));
  }
};

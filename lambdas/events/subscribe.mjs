import {
  EventBridgeClient,
  CreateConnectionCommand,
  CreateApiDestinationCommand,
  PutRuleCommand,
  PutTargetsCommand,
} from "@aws-sdk/client-eventbridge";

import { randomUUID } from "node:crypto";

const eventBridge = new EventBridgeClient({});

const BLOCKED_HOSTNAME_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^169\.254\./,
];

function isBlockedUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return true;
  }
  if (parsed.protocol !== "https:") return true;
  return BLOCKED_HOSTNAME_PATTERNS.some((pattern) =>
    pattern.test(parsed.hostname),
  );
}

export const handler = async (event) => {
  const body = JSON.parse(event.body || "{}");
  const webhookUrl = body.webhook_url;

  if (!webhookUrl || isBlockedUrl(webhookUrl)) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid or disallowed webhook_url" }),
    };
  }

  const subscriptionId = randomUUID();

  const connection = await eventBridge.send(
    new CreateConnectionCommand({
      Name: `debt-portfolio-conn-${subscriptionId}`,
      AuthorizationType: "API_KEY",
      AuthParameters: {
        ApiKeyAuthParameters: {
          ApiKeyName: "x-debt-portfolio-subscription",
          ApiKeyValue: subscriptionId,
        },
      },
    }),
  );

  const destination = await eventBridge.send(
    new CreateApiDestinationCommand({
      Name: `debt-portfolio-dest-${subscriptionId}`,
      ConnectionArn: connection.ConnectionArn,
      InvocationEndpoint: webhookUrl,
      HttpMethod: "POST",
    }),
  );

  const rule = await eventBridge.send(
    new PutRuleCommand({
      Name: `debt-portfolio-rule-${subscriptionId}`,
      EventBusName: process.env.EVENT_BUS_NAME,
      EventPattern: JSON.stringify({
        source: ["debt-portfolio.accounts"],
        "detail-type": ["Account State Change"],
      }),
      State: "ENABLED",
    }),
  );

  await eventBridge.send(
    new PutTargetsCommand({
      Rule: `debt-portfolio-rule-${subscriptionId}`,
      EventBusName: process.env.EVENT_BUS_NAME,
      Targets: [
        {
          Id: `target-${subscriptionId}`,
          Arn: destination.ApiDestinationArn,
        },
      ],
    }),
  );

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subscription_id: subscriptionId,
      rule_arn: rule.RuleArn,
    }),
  };
};

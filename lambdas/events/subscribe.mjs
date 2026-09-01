import {
  EventBridgeClient,
  CreateConnectionCommand,
  CreateApiDestinationCommand,
  PutRuleCommand,
  PutTargetsCommand,
} from "@aws-sdk/client-eventbridge";

import { randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";

const eventBridge = new EventBridgeClient({});

const BLOCKED_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^169\.254\./,
  /^0\./,
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i,
];

// TODO: EventBridge re-resolves DNS at actual delivery time (and on every
// retry), so this check does not fully close DNS-rebinding SSRF; a domain
// could resolve publicly here and privately later.
async function isBlockedUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return true;
  }
  if (parsed.protocol !== "https:") return true;
  if (/^localhost$/i.test(parsed.hostname)) return true;

  let addresses;
  try {
    addresses = await lookup(parsed.hostname, { all: true });
  } catch {
    return true;
  }

  return addresses.some(({ address }) =>
    BLOCKED_IP_PATTERNS.some((pattern) => pattern.test(address)),
  );
}

export const handler = async (event) => {
  const body = JSON.parse(event.body || "{}");
  const webhookUrl = body.webhook_url;

  if (!webhookUrl || (await isBlockedUrl(webhookUrl))) {
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
          RoleArn: process.env.EVENTBRIDGE_INVOKE_ROLE_ARN,
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

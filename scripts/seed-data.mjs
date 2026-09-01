import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  BatchWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "node:crypto";

const client = new DynamoDBClient({ region: process.env.AWS_REGION || "us-east-1" });
const ddb = DynamoDBDocumentClient.from(client);

const RISK_BANDS = ["low", "medium", "high", "severe"];
const PRODUCT_TYPES = ["debt-consolidation-loan", "settlement-plan", "credit-line"];
const STATUSES = ["active", "delinquent", "settled", "closed"];
const TRANSACTION_TYPES = ["payment", "missed", "settlement"];

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomDateWithinLastYear() {
  const now = Date.now();
  const oneYearMs = 365 * 24 * 60 * 60 * 1000;
  const date = new Date(now - Math.random() * oneYearMs);
  return date.toISOString();
}

async function batchWrite(tableName, items) {
  const chunks = [];
  for (let i = 0; i < items.length; i += 25) {
    chunks.push(items.slice(i, i + 25));
  }

  for (const chunk of chunks) {
    await ddb.send(
      new BatchWriteCommand({
        RequestItems: {
          [tableName]: chunk.map((item) => ({ PutRequest: { Item: item } })),
        },
      })
    );
  }
}

async function main() {
  const accounts = [];
  for (let i = 0; i < 50; i++) {
    accounts.push({
      account_id: `acc-${randomUUID()}`,
      balance: Math.round(Math.random() * 50000 * 100) / 100,
      status: randomFrom(STATUSES),
      risk_band: randomFrom(RISK_BANDS),
      product_type: randomFrom(PRODUCT_TYPES),
    });
  }

  await batchWrite(process.env.ACCOUNTS_TABLE_NAME, accounts);
  console.log(`Seeded ${accounts.length} accounts`);

  const transactions = [];
  for (let i = 0; i < 200; i++) {
    const account = randomFrom(accounts);
    const date = randomDateWithinLastYear();
    transactions.push({
      account_id: account.account_id,
      sk: `${date}#txn-${randomUUID()}`,
      amount: Math.round(Math.random() * 2000 * 100) / 100,
      date,
      type: randomFrom(TRANSACTION_TYPES),
    });
  }

  await batchWrite(process.env.TRANSACTIONS_TABLE_NAME, transactions);
  console.log(`Seeded ${transactions.length} transactions`);

  const roles = [
    {
      analyst_role: "read-only-analyst",
      allowed_endpoints: ["/accounts/{id}", "/accounts/{id}/transactions", "/portfolio/metrics", "/health"],
      rate_limit: 5,
      burst_limit: 10,
    },
    {
      analyst_role: "senior-analyst",
      allowed_endpoints: [
        "/accounts/{id}",
        "/accounts/{id}/transactions",
        "/portfolio/metrics",
        "/accounts/{id}/enriched",
        "/events/subscribe",
        "/health",
      ],
      rate_limit: 20,
      burst_limit: 40,
    },
  ];

  await batchWrite(process.env.CONSUMER_REGISTRY_TABLE_NAME, roles);
  console.log(`Seeded ${roles.length} consumer-registry roles`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

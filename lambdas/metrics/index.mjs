import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";

const ddbClient = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(ddbClient);

const CACHE_TTL_MS = 60_000;
let cachedResponse;
let cachedAt = 0;

async function scanAll(tableName) {
  let items = [];
  let lastEvaluatedKey;

  do {
    const result = await ddb.send(
      new ScanCommand({
        TableName: tableName,
        ExclusiveStartKey: lastEvaluatedKey,
      }),
    );
    items = items.concat(result.Items || []);
    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return items;
}

export const handler = async () => {
  if (cachedResponse && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedResponse;
  }

  const accounts = await scanAll(process.env.ACCOUNTS_TABLE_NAME);

  const byRiskBand = {};
  let totalBalance = 0;

  for (const account of accounts) {
    const band = account.risk_band || "unknown";
    if (!byRiskBand[band]) {
      byRiskBand[band] = { count: 0, sumBalance: 0 };
    }
    byRiskBand[band].count += 1;
    byRiskBand[band].sumBalance += account.balance || 0;
    totalBalance += account.balance || 0;
  }

  const summary = {};
  for (const [band, data] of Object.entries(byRiskBand)) {
    summary[band] = {
      count: data.count,
      avg_balance: data.sumBalance / data.count,
    };
  }

  cachedResponse = {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      total_accounts: accounts.length,
      total_balance: totalBalance,
      by_risk_band: summary,
    }),
  };
  cachedAt = Date.now();

  return cachedResponse;
};

import { DynamoDBClient, DescribeTableCommand } from "@aws-sdk/client-dynamodb";
import {
  BedrockClient,
  ListFoundationModelsCommand,
} from "@aws-sdk/client-bedrock";

const ddbClient = new DynamoDBClient({});
const bedrockClient = new BedrockClient({});

async function checkDynamoDb() {
  try {
    await ddbClient.send(
      new DescribeTableCommand({ TableName: process.env.ACCOUNTS_TABLE_NAME }),
    );
    return "reachable";
  } catch {
    return "unreachable";
  }
}

async function checkBedrock() {
  try {
    await bedrockClient.send(new ListFoundationModelsCommand({}));
    return "reachable";
  } catch {
    return "unreachable";
  }
}

export const handler = async () => {
  const [dynamodb, bedrock] = await Promise.all([
    checkDynamoDb(),
    checkBedrock(),
  ]);

  const healthy = dynamodb === "reachable" && bedrock === "reachable";

  return {
    statusCode: healthy ? 200 : 503,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dynamodb, bedrock }),
  };
};

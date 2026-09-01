import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";

import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";

const ddbClient = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(ddbClient);
const ssm = new SSMClient({});
const bedrock = new BedrockRuntimeClient({});

let cachedPrompt;

async function getPromptTemplate() {
  if (cachedPrompt) return cachedPrompt;
  const result = await ssm.send(
    new GetParameterCommand({ Name: process.env.PROMPT_PARAM_NAME }),
  );
  cachedPrompt = result.Parameter.Value;
  return cachedPrompt;
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

export const handler = async (event) => {
  // TODO: no per-account authorization check; any authenticated analyst can read any account_id
  const accountId = event.pathParameters?.id;
  if (!accountId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing account id" }),
    };
  }

  const cacheEntry = await ddb.send(
    new GetCommand({
      TableName: process.env.ENRICHMENT_CACHE_TABLE_NAME,
      Key: { account_id: accountId },
    }),
  );

  if (cacheEntry.Item && cacheEntry.Item.expires_at > nowSeconds()) {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        account_id: accountId,
        narrative: cacheEntry.Item.narrative,
        action_flag: cacheEntry.Item.action_flag,
        cached: true,
      }),
    };
  }

  const accountResult = await ddb.send(
    new GetCommand({
      TableName: process.env.ACCOUNTS_TABLE_NAME,
      Key: { account_id: accountId },
    }),
  );

  if (!accountResult.Item) {
    return {
      statusCode: 404,
      body: JSON.stringify({ error: "Account not found" }),
    };
  }

  const transactionResult = await ddb.send(
    new QueryCommand({
      TableName: process.env.TRANSACTIONS_TABLE_NAME,
      KeyConditionExpression: "account_id = :id",
      ExpressionAttributeValues: { ":id": accountId },
    }),
  );

  const account = accountResult.Item;
  const transactions = transactionResult.Items || [];

  try {
    const promptTemplate = await getPromptTemplate();
    const prompt = promptTemplate
      .replaceAll("[[account]]", JSON.stringify(account))
      .replaceAll("[[transactions]]", JSON.stringify(transactions));

    const bedrockResponse = await bedrock.send(
      new ConverseCommand({
        modelId: process.env.BEDROCK_MODEL_ID,
        messages: [{ role: "user", content: [{ text: prompt }] }],
        inferenceConfig: { maxTokens: 1024 },
      }),
    );

    const rawText = bedrockResponse.output?.message?.content?.[0]?.text;

    if (!rawText) {
      throw new Error("Bedrock returned no text content");
    }

    const parsed = JSON.parse(rawText);
    const narrative = parsed.narrative;
    const actionFlag = parsed.action_flag;

    if (!narrative || !actionFlag) {
      throw new Error("Bedrock response missing narrative or action_flag");
    }

    await ddb.send(
      new PutCommand({
        TableName: process.env.ENRICHMENT_CACHE_TABLE_NAME,
        Item: {
          account_id: accountId,
          narrative,
          action_flag: actionFlag,
          generated_at: new Date().toISOString(),
          expires_at: nowSeconds() + 3600,
        },
      }),
    );

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        account,
        transactions,
        narrative,
        action_flag: actionFlag,
        cached: false,
      }),
    };
  } catch (err) {
    console.error("Enrichment failed:", err);
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "x-enrichment-status": "degraded",
      },
      body: JSON.stringify({
        account,
        transactions,
        narrative: null,
        action_flag: null,
      }),
    };
  }
};

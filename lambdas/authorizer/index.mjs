import { JwtRsaVerifier } from "aws-jwt-verify";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";

const ddbClient = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(ddbClient);

const verifier = JwtRsaVerifier.create({
  issuer: `https://${process.env.AUTH0_DOMAIN}/`,
  audience: process.env.AUTH0_AUDIENCE,
  jwksUri: process.env.AUTH0_JWKS_URL,
});

function buildPolicy(principalId, effect, resource, context) {
  return {
    principalId,
    policyDocument: {
      Version: "2012-10-17",
      Statement: [
        {
          Action: "execute-api:Invoke",
          Effect: effect,
          Resource: resource,
        },
      ],
    },
    context,
  };
}

export const handler = async (event) => {
  const token = (event.authorizationToken || "").replace(/^Bearer\s+/i, "");

  if (!token) {
    throw new Error("Unauthorized");
  }

  let payload;
  try {
    payload = await verifier.verify(token);
  } catch (err) {
    throw new Error("Unauthorized");
  }

  const role = payload[process.env.AUTH0_ROLE_CLAIM];
  if (!role) {
    throw new Error("Unauthorized");
  }

  const registryEntry = await ddb.send(
    new GetCommand({
      TableName: process.env.CONSUMER_REGISTRY_TABLE_NAME,
      Key: { analyst_role: role },
    }),
  );

  if (!registryEntry.Item) {
    return buildPolicy(payload.sub, "Deny", event.methodArn, {});
  }

  return buildPolicy(payload.sub, "Allow", event.methodArn, {
    role,
    usageIdentifierKey: registryEntry.Item.api_key_value || "",
  });
};

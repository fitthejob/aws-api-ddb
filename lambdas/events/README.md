# Events Lambdas

## `subscribe.mjs`, `POST /events/subscribe`

1. Parse the request body for a `webhook_url`: the analyst's own endpoint that wants to receive account-change notifications.
2. Validate that URL before doing anything else (`isBlockedUrl`). It must parse as a valid URL, use `https://` and not plaintext `http://`, and its hostname must not match any private or internal IP range (`localhost`, `127.x`, `10.x`, `192.168.x`, `172.16-31.x`, `169.254.x` link-local). This is SSRF protection; without it, a malicious caller could register a webhook pointing at internal AWS metadata endpoints or other private infrastructure reachable from EventBridge. Any failure here returns `400`.
3. Generate a unique `subscriptionId` (`randomUUID()`). This both identifies the subscription and doubles as the API key value for authenticating outbound calls to the analyst's webhook.
4. Create an EventBridge Connection (`CreateConnectionCommand`). This stores the API-key auth credentials EventBridge will attach to every outbound request it makes to the webhook, so the analyst's endpoint can verify the call actually came from this system.
5. Create an EventBridge API Destination (`CreateApiDestinationCommand`). This is the actual HTTP target: it ties the connection to the specific `webhookUrl` and specifies `POST` as the delivery method.
6. Create an EventBridge Rule (`PutRuleCommand`) on the shared event bus, filtered to only match events with `source: "debt-portfolio.accounts"` and `detail-type: "Account State Change"`. This is the subscription filter; the rule only fires for account-change events, not every event on the bus.
7. Attach the API Destination as the rule's Target (`PutTargetsCommand`). This is what actually wires "when this rule matches, POST to that destination" together; without this step, the rule would match events but deliver them nowhere.
8. Return `200` with the `subscription_id` and the rule's ARN, so the caller has a durable reference to what they just created. This is useful for future unsubscribe or management operations, even though that endpoint is not built yet.

## `stream-producer.mjs`, triggered by the DynamoDB Stream on the `accounts` table

1. Receive the DynamoDB Stream event, which contains a batch of `Records` describing recent writes to the `accounts` table.
2. Iterate over each record and skip anything that is not a `MODIFY` event; inserts and deletes are not relevant here, since this producer only cares about status transitions on existing accounts.
3. Read the account's `status` attribute from both `OldImage` and `NewImage` on the record. These represent the item's value before and after the update, respectively.
4. If both values are present and they differ, treat this as a real state change and build an EventBridge entry for it: `source` is `debt-portfolio.accounts`, `detail-type` is `Account State Change`, and `Detail` carries the account ID along with the old and new status values as JSON.
5. Collect all qualifying entries from the batch into a single array, rather than sending one `PutEventsCommand` per record.
6. If any entries were collected, send them to the event bus in one batched `PutEventsCommand` call. If nothing in the batch represented a real status change, skip the EventBridge call entirely.

This Lambda has no return value read by any caller; it is a fire-and-forget stream consumer, not something invoked synchronously by a client request. Its only job is translating raw DynamoDB Stream records into meaningful domain events (state changes) on the shared event bus, which is what the rules created by `subscribe.mjs` are listening for.

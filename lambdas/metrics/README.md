# Metrics Lambda

`GET /metrics`

1. Check the in-memory cache first (`cachedResponse`, a module-level variable with a 60-second TTL). If a cached response exists and is still within that window, return it immediately with no DynamoDB access at all. This cache is scoped to a single warm Lambda container; a cold start or a different concurrent container will not see it.
2. On a cache miss, scan the entire `accounts` table using `scanAll`, a helper that pages through `ScanCommand` results with `ExclusiveStartKey`/`LastEvaluatedKey` until every item has been retrieved. A single `Scan` call only returns up to 1MB of data, so this loop is required to get a complete picture once the table grows past that limit.
3. Initialize an empty `byRiskBand` object and a `totalBalance` accumulator.
4. Iterate over every account. For each one, read its `risk_band` (defaulting to `"unknown"` if not set) and its `balance` (defaulting to `0` if not set), then accumulate a running `count` and `sumBalance` per risk band, along with the portfolio-wide `totalBalance`.
5. Once every account has been processed, convert the raw per-band accumulators into the final summary shape: `count` stays as-is, and `avg_balance` is computed by dividing `sumBalance` by `count` for that band.
6. Store the response in `cachedResponse` along with the current timestamp, then return `200` with `total_accounts` (the full account count), `total_balance` (portfolio-wide sum), and `by_risk_band` (the per-band summary built in step 5).

This Lambda takes no path or query parameters; it always summarizes the entire `accounts` table, subject to the cache above. The cache trades up to 60 seconds of staleness for avoiding a full table scan on every request; this is acceptable for the expected internal-analyst usage pattern, but would need to move to a precomputed or streamed aggregation if the accounts table grows very large.

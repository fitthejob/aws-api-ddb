# Metrics Lambda

`GET /metrics`

1. Scan the entire `accounts` table using `scanAll`, a helper that pages through `ScanCommand` results with `ExclusiveStartKey`/`LastEvaluatedKey` until every item has been retrieved. A single `Scan` call only returns up to 1MB of data, so this loop is required to get a complete picture once the table grows past that limit.
2. Initialize an empty `byRiskBand` object and a `totalBalance` accumulator.
3. Iterate over every account. For each one, read its `risk_band` (defaulting to `"unknown"` if not set) and its `balance` (defaulting to `0` if not set), then accumulate a running `count` and `sumBalance` per risk band, along with the portfolio-wide `totalBalance`.
4. Once every account has been processed, convert the raw per-band accumulators into the final summary shape: `count` stays as-is, and `avg_balance` is computed by dividing `sumBalance` by `count` for that band.
5. Return `200` with `total_accounts` (the full account count), `total_balance` (portfolio-wide sum), and `by_risk_band` (the per-band summary built in step 4).

This Lambda takes no path or query parameters; it always summarizes the entire `accounts` table. Because it performs a full table scan, cost and latency grow with the size of the table; this is acceptable for the expected internal-analyst usage pattern, but would need to move to a precomputed or streamed aggregation if the accounts table grows very large.

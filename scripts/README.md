# Seed Data Script

1. `seed-data.mjs` populates DynamoDB with mock data for local testing and demos; it takes no arguments, reading table names and region from environment variables instead.
2. It generates 50 accounts with random balance, status, risk band, and product type, then writes them to the accounts table via `BatchWriteCommand`, chunked into groups of 25 since that is DynamoDB's per-request batch limit.
3. It generates 200 transactions, each assigned to a randomly chosen account from the batch just created; each transaction's sort key is `<date>#txn-<uuid>`, so transactions for a given account naturally sort chronologically under a `Query`.
4. It writes two fixed consumer-registry roles, `read-only-analyst` and `senior-analyst`, each with a distinct set of allowed endpoints and throttle limits; these mirror `var.consumer_registry_seed` in the root module, though the two are maintained separately and are not derived from each other.
5. Required environment variables: `ACCOUNTS_TABLE_NAME`, `TRANSACTIONS_TABLE_NAME`, `CONSUMER_REGISTRY_TABLE_NAME`, `AWS_REGION`. Get the table names from `terraform output accounts_table_name`, `transactions_table_name`, and `consumer_registry_table_name` in the repo root.
6. Run it:

```bash
cd scripts
npm install
ACCOUNTS_TABLE_NAME=<value> \
TRANSACTIONS_TABLE_NAME=<value> \
CONSUMER_REGISTRY_TABLE_NAME=<value> \
AWS_REGION=<value> \
node seed-data.mjs
cd ..
```

7. It is not idempotent; running it again appends another 50 accounts and 200 transactions rather than replacing the existing data.

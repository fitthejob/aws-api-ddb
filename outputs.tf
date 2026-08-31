output "accounts_table_name" {
  value = module.dynamodb.accounts_table_name
}

output "transactions_table_name" {
  value = module.dynamodb.transactions_table_name
}

output "consumer_registry_table_name" {
  value = module.dynamodb.consumer_registry_table_name
}

output "enrichment_cache_table_name" {
  value = module.dynamodb.enrichment_cache_table_name
}

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

output "v1_invoke_url" {
  value = module.api_gateway.v1_invoke_url
}

output "v2_invoke_url" {
  value = module.api_gateway.v2_invoke_url
}

output "accounts_table_name" {
  value = aws_dynamodb_table.accounts.name
}

output "accounts_table_arn" {
  value = aws_dynamodb_table.accounts.arn
}

output "accounts_table_stream_arn" {
  value = aws_dynamodb_table.accounts.stream_arn
}

output "transactions_table_name" {
  value = aws_dynamodb_table.transactions.name
}

output "transactions_table_arn" {
  value = aws_dynamodb_table.transactions.arn
}

output "consumer_registry_table_name" {
  value = aws_dynamodb_table.consumer_registry.name
}

output "consumer_registry_table_arn" {
  value = aws_dynamodb_table.consumer_registry.arn
}

output "enrichment_cache_table_name" {
  value = aws_dynamodb_table.enrichment_cache.name
}

output "enrichment_cache_table_arn" {
  value = aws_dynamodb_table.enrichment_cache.arn
}

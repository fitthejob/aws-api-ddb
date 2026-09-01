output "enrichment_lambda_arn" {
  value = aws_lambda_function.enrichment.arn
}

output "enrichment_lambda_invoke_arn" {
  value = aws_lambda_function.enrichment.invoke_arn
}

output "enrichment_lambda_function_name" {
  value = aws_lambda_function.enrichment.function_name
}

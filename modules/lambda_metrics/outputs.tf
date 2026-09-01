output "metrics_lambda_arn" {
  value = aws_lambda_function.metrics.arn
}

output "metrics_lambda_invoke_arn" {
  value = aws_lambda_function.metrics.invoke_arn
}

output "metrics_lambda_function_name" {
  value = aws_lambda_function.metrics.function_name
}

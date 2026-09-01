output "health_lambda_arn" {
  value = aws_lambda_function.health.arn
}

output "health_lambda_invoke_arn" {
  value = aws_lambda_function.health.invoke_arn
}

output "health_lambda_function_name" {
  value = aws_lambda_function.health.function_name
}

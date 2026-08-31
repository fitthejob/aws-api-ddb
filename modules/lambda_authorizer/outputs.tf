output "authorizer_lambda_arn" {
  value = aws_lambda_function.authorizer.arn
}

output "authorizer_lambda_invoke_arn" {
  value = aws_lambda_function.authorizer.invoke_arn
}

output "authorizer_lambda_function_name" {
  value = aws_lambda_function.authorizer.function_name
}

output "subscribe_lambda_arn" {
  value = aws_lambda_function.subscribe.arn
}

output "subscribe_lambda_invoke_arn" {
  value = aws_lambda_function.subscribe.invoke_arn
}

output "subscribe_lambda_function_name" {
  value = aws_lambda_function.subscribe.function_name
}

output "event_bus_name" {
  value = aws_cloudwatch_event_bus.this.name
}

output "rest_api_id" {
  value = aws_api_gateway_rest_api.this.id
}

output "v1_invoke_url" {
  value = aws_api_gateway_stage.v1.invoke_url
}

output "v2_invoke_url" {
  value = aws_api_gateway_stage.v2.invoke_url
}

output "api_key_values" {
  value     = { for k, v in aws_api_gateway_api_key.role : k => v.value }
  sensitive = true
}

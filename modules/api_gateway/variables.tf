variable "project_name" {
  type = string
}

variable "environment" {
  type = string
}

variable "aws_region" {
  type = string
}

variable "accounts_table_name" {
  type = string
}

variable "transactions_table_name" {
  type = string
}

variable "enrichment_lambda_invoke_arn" {
  type = string
}

variable "enrichment_lambda_arn" {
  type = string
}

variable "subscribe_lambda_invoke_arn" {
  type = string
}

variable "subscribe_lambda_arn" {
  type = string
}

variable "metrics_lambda_invoke_arn" {
  type = string
}

variable "metrics_lambda_arn" {
  type = string
}

variable "health_lambda_invoke_arn" {
  type = string
}

variable "health_lambda_arn" {
  type = string
}

variable "authorizer_lambda_invoke_arn" {
  type = string
}

variable "authorizer_lambda_arn" {
  type = string
}

variable "consumer_registry_seed" {
  type = map(object({
    rate_limit  = number
    burst_limit = number
  }))
}

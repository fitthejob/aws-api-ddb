variable "project_name" {
  type = string
}

variable "environment" {
  type = string
}

variable "aws_region" {
  type = string
}

variable "rest_api_id" {
  type = string
}

variable "enrichment_lambda_function_name" {
  type = string
}

variable "subscribe_lambda_function_name" {
  type = string
}

variable "metrics_lambda_function_name" {
  type = string
}

variable "health_lambda_function_name" {
  type = string
}

variable "authorizer_lambda_function_name" {
  type = string
}

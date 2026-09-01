variable "project_name" {
  type = string
}

variable "environment" {
  type = string
}

variable "accounts_table_name" {
  type = string
}

variable "accounts_table_arn" {
  type = string
}

variable "transactions_table_name" {
  type = string
}

variable "transactions_table_arn" {
  type = string
}

variable "enrichment_cache_table_name" {
  type = string
}

variable "enrichment_cache_table_arn" {
  type = string
}

variable "bedrock_model_id" {
  type    = string
  default = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
}

variable "aws_region" {
  type = string
}

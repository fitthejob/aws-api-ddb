variable "aws_region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Project name used a resource naming prefix"
  type        = string
  default     = "debt-portfolio-api"
}

variable "environment" {
  description = "Deployment environment tag"
  type        = string
  default     = "dev"
}

variable "auth0_domain" {
  description = "Auth0 tenant domain"
  type        = string
}

variable "auth0_audience" {
  description = "Auth0 API idnetifier / JWT audience"
  type        = string
  default     = "https://debt-portfolio-api"
}

variable "auth0_role_claim" {
  description = "Customer claim namespace carrying the analyst role"
  type        = string
  default     = "https://debt-portfolio-api/role"
}

variable "consumer_registry_seed" {
  description = "Analyst roles and their throttle limits, mirrors consumer-registry table"
  type = map(object({
    rate_limit  = number
    burst_limit = number
  }))
  default = {
    "read-only-analyst" = {
      rate_limit  = 5
      burst_limit = 10
    }
    "senior-analyst" = {
      rate_limit  = 20
      burst_limit = 40
    }
  }
}

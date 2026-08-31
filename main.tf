provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

module "dynamodb" {
  source       = "./modules/dynamodb"
  project_name = var.project_name
  environment  = var.environment
}

module "lambda_authorizer" {
  source = "./modules/lambda_authorizer"

  project_name                 = var.project_name
  environment                  = var.environment
  consumer_registry_table_name = module.dynamodb.consumer_registry_table_name
  consumer_registry_table_arn  = module.dynamodb.consumer_registry_table_arn
  auth0_domain                 = var.auth0_domain
  auth0_audience               = var.auth0_audience
  auth0_jwks_url               = "https://${var.auth0_domain}/.well-known/jwks.json"
  auth0_role_claim             = var.auth0_role_claim
}

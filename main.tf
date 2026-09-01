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

module "lambda_enrichment" {
  source = "./modules/lambda_enrichment"

  project_name = var.project_name
  environment  = var.environment
  aws_region   = var.aws_region

  accounts_table_name         = module.dynamodb.accounts_table_name
  accounts_table_arn          = module.dynamodb.accounts_table_arn
  transactions_table_name     = module.dynamodb.transactions_table_name
  transactions_table_arn      = module.dynamodb.transactions_table_arn
  enrichment_cache_table_name = module.dynamodb.enrichment_cache_table_name
  enrichment_cache_table_arn  = module.dynamodb.enrichment_cache_table_arn
}

module "lambda_events" {
  source = "./modules/lambda_events"

  project_name              = var.project_name
  environment               = var.environment
  aws_region                = var.aws_region
  accounts_table_stream_arn = module.dynamodb.accounts_table_stream_arn
}

module "lambda_metrics" {
  source = "./modules/lambda_metrics"

  project_name        = var.project_name
  environment         = var.environment
  accounts_table_name = module.dynamodb.accounts_table_name
  accounts_table_arn  = module.dynamodb.accounts_table_arn
}

module "lambda_health" {
  source = "./modules/lambda_health"

  project_name        = var.project_name
  environment         = var.environment
  accounts_table_name = module.dynamodb.accounts_table_name
  accounts_table_arn  = module.dynamodb.accounts_table_arn
}

module "api_gateway" {
  source = "./modules/api_gateway"

  project_name                 = var.project_name
  environment                  = var.environment
  aws_region                   = var.aws_region
  accounts_table_name          = module.dynamodb.accounts_table_name
  transactions_table_name      = module.dynamodb.transactions_table_name
  enrichment_lambda_invoke_arn = module.lambda_enrichment.enrichment_lambda_invoke_arn
  enrichment_lambda_arn        = module.lambda_enrichment.enrichment_lambda_arn
  subscribe_lambda_invoke_arn  = module.lambda_events.subscribe_lambda_invoke_arn
  subscribe_lambda_arn         = module.lambda_events.subscribe_lambda_arn
  metrics_lambda_invoke_arn    = module.lambda_metrics.metrics_lambda_invoke_arn
  metrics_lambda_arn           = module.lambda_metrics.metrics_lambda_arn
  health_lambda_invoke_arn     = module.lambda_health.health_lambda_invoke_arn
  health_lambda_arn            = module.lambda_health.health_lambda_arn
  authorizer_lambda_invoke_arn = module.lambda_authorizer.authorizer_lambda_invoke_arn
  authorizer_lambda_arn        = module.lambda_authorizer.authorizer_lambda_arn
  consumer_registry_seed       = var.consumer_registry_seed
}



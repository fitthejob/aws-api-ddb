resource "aws_iam_role" "api_gateway_dynamodb" {
  name = "${var.project_name}-${var.environment}-apigw-ddb-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action    = "sts:AssumeRole"
        Effect    = "Allow"
        Principal = { Service = "apigateway.amazonaws.com" }
      }
    ]
  })
}

resource "aws_iam_role_policy" "api_gateway_dynamodb" {
  name = "${var.project_name}-${var.environment}-apigw-ddb-policy"
  role = aws_iam_role.api_gateway_dynamodb.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = ["dynamodb:GetItem", "dynamodb:Query"]
        Resource = [
          "arn:aws:dynamodb:${var.aws_region}:*:table/${var.accounts_table_name}",
          "arn:aws:dynamodb:${var.aws_region}:*:table/${var.transactions_table_name}"
        ]
      }
    ]
  })
}

locals {
  rendered_openapi = templatefile("${path.root}/openapi/openapi.yaml", {
    aws_region                    = var.aws_region
    api_gateway_dynamodb_role_arn = aws_iam_role.api_gateway_dynamodb.arn
    get_account_request_vtl       = jsonencode(file("${path.root}/openapi/templates/get-account-request.vtl"))
    strip_ddb_response_vtl        = jsonencode(file("${path.root}/openapi/templates/strip-ddb-response.vtl"))
    strip_ddb_response_v2_vtl     = jsonencode(file("${path.root}/openapi/templates/strip-ddb-response-v2.vtl"))
    get_transactions_request_vtl  = jsonencode(file("${path.root}/openapi/templates/get-transactions-request.vtl"))
    strip_ddb_list_response_vtl   = jsonencode(file("${path.root}/openapi/templates/strip-ddb-list-response.vtl"))
    enrichment_lambda_invoke_arn  = var.enrichment_lambda_invoke_arn
    subscribe_lambda_invoke_arn   = var.subscribe_lambda_invoke_arn
    metrics_lambda_invoke_arn     = var.metrics_lambda_invoke_arn
    health_lambda_invoke_arn      = var.health_lambda_invoke_arn
    authorizer_lambda_invoke_arn  = var.authorizer_lambda_invoke_arn
  })
}

resource "aws_api_gateway_rest_api" "this" {
  name = "${var.project_name}-${var.environment}"
  body = local.rendered_openapi

  endpoint_configuration {
    types = ["REGIONAL"]
  }
}

resource "aws_lambda_permission" "apigw_invoke_authorizer" {
  statement_id  = "AllowAPIGatewayInvokeAuthorizer"
  action        = "lambda:InvokeFunction"
  function_name = var.authorizer_lambda_arn
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.this.execution_arn}/authorizers/*"
}

resource "aws_lambda_permission" "apigw_invoke_enrichment" {
  statement_id  = "AllowAPIGatewayInvokeEnrichment"
  action        = "lambda:InvokeFunction"
  function_name = var.enrichment_lambda_arn
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.this.execution_arn}/*/*"
}

resource "aws_lambda_permission" "apigw_invoke_subscribe" {
  statement_id  = "AllowAPIGatewayInvokeSubscribe"
  action        = "lambda:InvokeFunction"
  function_name = var.subscribe_lambda_arn
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.this.execution_arn}/*/*"
}

resource "aws_lambda_permission" "apigw_invoke_metrics" {
  statement_id  = "AllowAPIGatewayInvokeMetrics"
  action        = "lambda:InvokeFunction"
  function_name = var.metrics_lambda_arn
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.this.execution_arn}/*/*"
}

resource "aws_lambda_permission" "apigw_invoke_health" {
  statement_id  = "AllowAPIGatewayInvokeHealth"
  action        = "lambda:InvokeFunction"
  function_name = var.health_lambda_arn
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.this.execution_arn}/*/*"
}

resource "aws_api_gateway_deployment" "this" {
  rest_api_id = aws_api_gateway_rest_api.this.id

  triggers = {
    redeployment = sha1(local.rendered_openapi)
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_api_gateway_stage" "v1" {
  deployment_id = aws_api_gateway_deployment.this.id
  rest_api_id   = aws_api_gateway_rest_api.this.id
  stage_name    = "v1"

  variables = {
    accountsTableName     = var.accounts_table_name
    transactionsTableName = var.transactions_table_name
  }

  xray_tracing_enabled = true
}

resource "aws_api_gateway_stage" "v2" {
  deployment_id = aws_api_gateway_deployment.this.id
  rest_api_id   = aws_api_gateway_rest_api.this.id
  stage_name    = "v2"

  variables = {
    accountsTableName     = var.accounts_table_name
    transactionsTableName = var.transactions_table_name
  }

  xray_tracing_enabled = true
}

resource "aws_api_gateway_usage_plan" "role" {
  for_each = var.consumer_registry_seed

  name = "${var.project_name}-${var.environment}-${each.key}"

  api_stages {
    api_id = aws_api_gateway_rest_api.this.id
    stage  = aws_api_gateway_stage.v2.stage_name
  }

  api_stages {
    api_id = aws_api_gateway_rest_api.this.id
    stage  = aws_api_gateway_stage.v1.stage_name
  }

  throttle_settings {
    rate_limit  = each.value.rate_limit
    burst_limit = each.value.burst_limit
  }
}

resource "aws_api_gateway_api_key" "role" {
  for_each = var.consumer_registry_seed

  name = "${var.project_name}-${var.environment}-${each.key}-key"
}

resource "aws_api_gateway_usage_plan_key" "role" {
  for_each = var.consumer_registry_seed

  key_id        = aws_api_gateway_api_key.role[each.key].id
  key_type      = "API_KEY"
  usage_plan_id = aws_api_gateway_usage_plan.role[each.key].id
}



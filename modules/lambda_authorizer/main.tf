data "archive_file" "authorizer" {
  type        = "zip"
  source_dir  = "${path.root}/lambdas/authorizer"
  output_path = "${path.module}/build/authorizer.zip"
  excludes    = ["package-lock.json"]
}

resource "aws_iam_role" "authorizer" {
  name = "${var.project_name}-${var.environment}-authorizer-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action    = "sts:AssumeRole"
        Effect    = "Allow"
        Principal = { Service = "lambda.amazonaws.com" }
      }
    ]
  })
}


resource "aws_iam_role_policy_attachment" "authorizer_basic_logs" {
  role       = aws_iam_role.authorizer.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "authorizer_ddb_read" {
  name = "${var.project_name}-${var.environment}-authorizer-ddb-read"
  role = aws_iam_role.authorizer.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem"]
        Resource = var.consumer_registry_table_arn
      }
    ]
  })
}

resource "aws_lambda_function" "authorizer" {
  function_name    = "${var.project_name}-${var.environment}-authorizer"
  role             = aws_iam_role.authorizer.arn
  handler          = "index.handler"
  runtime          = "nodejs24.x"
  filename         = data.archive_file.authorizer.output_path
  source_code_hash = data.archive_file.authorizer.output_base64sha256
  timeout          = 10

  tracing_config {
    mode = "Active"
  }

  environment {
    variables = {
      AUTH0_DOMAIN                 = var.auth0_domain
      AUTH0_AUDIENCE               = var.auth0_audience
      AUTH0_JWKS_URL               = var.auth0_jwks_url
      AUTH0_ROLE_CLAIM             = var.auth0_role_claim
      CONSUMER_REGISTRY_TABLE_NAME = var.consumer_registry_table_name
    }
  }
}

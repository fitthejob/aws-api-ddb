data "archive_file" "health" {
  type        = "zip"
  source_dir  = "${path.root}/lambdas/health"
  output_path = "${path.module}/build/health.zip"
  excludes    = ["package-lock.json"]
}

resource "aws_iam_role" "health" {
  name = "${var.project_name}-${var.environment}-health-role"

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

resource "aws_iam_role_policy_attachment" "health_basic_logs" {
  role       = aws_iam_role.health.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "health_permissions" {
  name = "${var.project_name}-${var.environment}-health-permissions"
  role = aws_iam_role.health.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["dynamodb:DescribeTable"]
        Resource = var.accounts_table_arn
      },
      {
        Effect   = "Allow"
        Action   = ["bedrock:ListFoundationModels"]
        Resource = "*"
      }
    ]
  })
}

resource "aws_lambda_function" "health" {
  function_name    = "${var.project_name}-${var.environment}-health"
  role             = aws_iam_role.health.arn
  handler          = "index.handler"
  runtime          = "nodejs24.x"
  filename         = data.archive_file.health.output_path
  source_code_hash = data.archive_file.health.output_base64sha256
  timeout          = 10

  tracing_config {
    mode = "Active"
  }

  environment {
    variables = {
      ACCOUNTS_TABLE_NAME = var.accounts_table_name
    }
  }
}

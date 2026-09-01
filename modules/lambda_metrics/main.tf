data "archive_file" "metrics" {
  type        = "zip"
  source_dir  = "${path.root}/lambdas/metrics"
  output_path = "${path.module}/build/metrics.zip"
  excludes    = ["package-lock.json"]
}

resource "aws_iam_role" "metrics" {
  name = "${var.project_name}-${var.environment}-metrics-role"

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

resource "aws_iam_role_policy_attachment" "metrics_basic_logs" {
  role       = aws_iam_role.metrics.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "metrics_ddb_read" {
  name = "${var.project_name}-${var.environment}-metrics-ddb-read"
  role = aws_iam_role.metrics.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["dynamodb:Scan"]
        Resource = var.accounts_table_arn
      }
    ]
  })
}

resource "aws_lambda_function" "metrics" {
  function_name    = "${var.project_name}-${var.environment}-metrics"
  role             = aws_iam_role.metrics.arn
  handler          = "index.handler"
  runtime          = "nodejs24.x"
  filename         = data.archive_file.metrics.output_path
  source_code_hash = data.archive_file.metrics.output_base64sha256
  timeout          = 15

  tracing_config {
    mode = "Active"
  }

  environment {
    variables = {
      ACCOUNTS_TABLE_NAME = var.accounts_table_name
    }
  }
}

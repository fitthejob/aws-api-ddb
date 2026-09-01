resource "aws_cloudwatch_event_bus" "this" {
  name = "${var.project_name}-${var.environment}-bus"
}

data "archive_file" "events" {
  type        = "zip"
  source_dir  = "${path.root}/lambdas/events"
  output_path = "${path.module}/build/events.zip"
  excludes    = ["package-lock.json"]
}

resource "aws_iam_role" "events" {
  name = "${var.project_name}-${var.environment}-events-role"

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

resource "aws_iam_role_policy_attachment" "events_basic_logs" {
  role       = aws_iam_role.events.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "events_permissions" {
  name = "${var.project_name}-${var.environment}-events-permissions"
  role = aws_iam_role.events.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "events:PutEvents",
          "events:PutRule",
          "events:PutTargets",
          "events:CreateConnection",
          "events:CreateApiDestination",
          "events:DescribeRule"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetRecords",
          "dynamodb:GetShardIterator",
          "dynamodb:DescribeStream",
          "dynamodb:ListStreams"
        ]
        Resource = var.accounts_table_stream_arn
      }
    ]
  })
}

resource "aws_lambda_function" "subscribe" {
  function_name    = "${var.project_name}-${var.environment}-events-subscribe"
  role             = aws_iam_role.events.arn
  handler          = "subscribe.handler"
  runtime          = "nodejs24.x"
  filename         = data.archive_file.events.output_path
  source_code_hash = data.archive_file.events.output_base64sha256
  timeout          = 15

  tracing_config {
    mode = "Active"
  }

  environment {
    variables = {
      EVENT_BUS_NAME = aws_cloudwatch_event_bus.this.name
    }
  }
}

resource "aws_lambda_function" "stream_producer" {
  function_name    = "${var.project_name}-${var.environment}-events-stream-producer"
  role             = aws_iam_role.events.arn
  handler          = "stream-producer.handler"
  runtime          = "nodejs24.x"
  filename         = data.archive_file.events.output_path
  source_code_hash = data.archive_file.events.output_base64sha256
  timeout          = 15

  tracing_config {
    mode = "Active"
  }

  environment {
    variables = {
      EVENT_BUS_NAME = aws_cloudwatch_event_bus.this.name
    }
  }
}

resource "aws_lambda_event_source_mapping" "accounts_stream" {
  event_source_arn  = var.accounts_table_stream_arn
  function_name     = aws_lambda_function.stream_producer.arn
  starting_position = "LATEST"
}

resource "aws_ssm_parameter" "enrichment_prompt" {
  name  = "/${var.project_name}/${var.environment}/enrichment-prompt"
  type  = "String"
  value = file("${path.root}/docs/enrichment-prompt.txt")
}

data "archive_file" "enrichment" {
  type        = "zip"
  source_dir  = "${path.root}/lambdas/enrichment"
  output_path = "${path.module}/build/enrichment.zip"
  excludes    = ["package-lock.json"]
}

resource "aws_iam_role" "enrichment" {
  name = "${var.project_name}-${var.environment}-enrichment-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "enrichment_basic_logs" {
  role       = aws_iam_role.enrichment.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "enrichment_ddb" {
  name = "${var.project_name}-${var.environment}-enrichment-ddb"
  role = aws_iam_role.enrichment.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem"]
        Resource = var.accounts_table_arn
      },
      {
        Effect   = "Allow"
        Action   = ["dynamodb:Query"]
        Resource = var.transactions_table_arn
      },
      {
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem", "dynamodb:PutItem"]
        Resource = var.enrichment_cache_table_arn
      }
    ]
  })
}

resource "aws_iam_role_policy" "enrichment_ssm" {
  name = "${var.project_name}-${var.environment}-enrichment-ssm"
  role = aws_iam_role.enrichment.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["ssm:GetParameter"]
      Resource = aws_ssm_parameter.enrichment_prompt.arn
    }]
  })
}

resource "aws_iam_role_policy" "enrichment_bedrock" {
  name = "${var.project_name}-${var.environment}-enrichment-bedrock"
  role = aws_iam_role.enrichment.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["bedrock:InvokeModel"]
      Resource = "arn:aws:bedrock:${var.aws_region}:*:inference-profile/${var.bedrock_model_id}"
    }]
  })
}

resource "aws_lambda_function" "enrichment" {
  function_name    = "${var.project_name}-${var.environment}-enrichment"
  role             = aws_iam_role.enrichment.arn
  handler          = "index.handler"
  runtime          = "nodejs24.x"
  filename         = data.archive_file.enrichment.output_path
  source_code_hash = data.archive_file.enrichment.output_base64sha256
  timeout          = 30
  tracing_config { mode = "Active" }
  environment {
    variables = {
      ACCOUNTS_TABLE_NAME         = var.accounts_table_name
      TRANSACTIONS_TABLE_NAME     = var.transactions_table_name
      ENRICHMENT_CACHE_TABLE_NAME = var.enrichment_cache_table_name
      PROMPT_PARAM_NAME           = aws_ssm_parameter.enrichment_prompt.name
      BEDROCK_MODEL_ID            = var.bedrock_model_id
    }
  }
}

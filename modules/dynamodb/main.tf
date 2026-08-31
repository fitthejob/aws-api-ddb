resource "aws_dynamodb_table" "accounts" {
  name         = "${var.project_name}-${var.environment}-accounts"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "account_id"

  attribute {
    name = "account_id"
    type = "S"
  }

  stream_enabled   = true
  stream_view_type = "NEW_AND_OLD_IMAGES"

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_dynamodb_table" "transactions" {
  name         = "${var.project_name}-${var.environment}-transactions"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "account_id"
  range_key    = "sk"

  attribute {
    name = "account_id"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_dynamodb_table" "consumer_registry" {
  name         = "${var.project_name}-${var.environment}-consumer-registry"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "analyst_role"

  attribute {
    name = "analyst_role"
    type = "S"
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_dynamodb_table" "enrichment_cache" {
  name         = "${var.project_name}-${var.environment}-enrichment-cache"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "account_id"

  attribute {
    name = "account_id"
    type = "S"
  }

  ttl {
    attribute_name = "expires_at"
    enabled        = true
  }

  lifecycle {
    prevent_destroy = true
  }
}


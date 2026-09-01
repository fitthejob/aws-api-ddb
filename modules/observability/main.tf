resource "aws_cloudwatch_dashboard" "this" {
  dashboard_name = "${var.project_name}-${var.environment}"

  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 12
        height = 6
        properties = {
          title = "API Gateway Latency"
          metrics = [
            ["AWS/ApiGateway", "Latency", "ApiName", "${var.project_name}-${var.environment}"]
          ]
          period = 300
          stat   = "Average"
          region = var.aws_region
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 0
        width  = 12
        height = 6
        properties = {
          title = "API Gateway Error Rate"
          metrics = [
            ["AWS/ApiGateway", "4XXError", "ApiName", "${var.project_name}-${var.environment}"],
            ["AWS/ApiGateway", "5XXError", "ApiName", "${var.project_name}-${var.environment}"]
          ]
          period = 300
          stat   = "Sum"
          region = var.aws_region
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 6
        width  = 12
        height = 6
        properties = {
          title = "Enrichment Lambda Duration & Errors"
          metrics = [
            ["AWS/Lambda", "Duration", "FunctionName", var.enrichment_lambda_function_name],
            ["AWS/Lambda", "Errors", "FunctionName", var.enrichment_lambda_function_name]
          ]
          period = 300
          stat   = "Average"
          region = var.aws_region
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 6
        width  = 12
        height = 6
        properties = {
          title = "Enrichment Cache Hit Ratio"
          metrics = [
            ["DebtPortfolio/Enrichment", "CacheHit", { "stat" = "Sum" }],
            ["DebtPortfolio/Enrichment", "CacheMiss", { "stat" = "Sum" }]
          ]
          period = 300
          stat   = "Sum"
          region = var.aws_region
        }
      }
    ]
  })
}

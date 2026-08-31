terraform {
  backend "s3" {
    bucket       = "aws-api-ddb-tfstate-nevs-cloud-dev"
    key          = "debt-portfolio-api/terraform.tfstate"
    region       = "us-east-1"
    use_lockfile = true
    encrypt      = true
  }
}

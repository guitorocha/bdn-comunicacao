terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Opcional: remova ou adapte se quiser usar estado local
  # backend "s3" {
  #   bucket = "meu-terraform-state"
  #   key    = "bdn-comunicacao/terraform.tfstate"
  #   region = "sa-east-1"
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "bdn-comunicacao"
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  }
}

# Provider adicional em us-east-1 obrigatório para certificados ACM usados pelo CloudFront
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = {
      Project     = "bdn-comunicacao"
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  }
}

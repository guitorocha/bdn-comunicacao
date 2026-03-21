variable "aws_region" {
  description = "Região AWS onde os recursos serão criados"
  type        = string
  default     = "sa-east-1"
}

variable "environment" {
  description = "Ambiente de deploy (production, staging)"
  type        = string
  default     = "production"
}

variable "app_name" {
  description = "Nome base da aplicação usado nos recursos"
  type        = string
  default     = "bdn-comunicacao"
}

variable "lambda_zip_path" {
  description = "Caminho para o arquivo ZIP do bundle do backend (gerado pelo build)"
  type        = string
  default     = "../dist/lambda.zip"
}

variable "lambda_memory_size" {
  description = "Memória alocada para a Lambda em MB"
  type        = number
  default     = 256
}

variable "lambda_timeout" {
  description = "Timeout da Lambda em segundos"
  type        = number
  default     = 30
}

variable "cors_allowed_origins" {
  description = "Origens permitidas para o CORS no API Gateway"
  type        = list(string)
  default     = ["*"]
}

variable "cloudfront_price_class" {
  description = "Classe de preço do CloudFront (PriceClass_100 = EUA/Europa — mais barato)"
  type        = string
  default     = "PriceClass_100"
}

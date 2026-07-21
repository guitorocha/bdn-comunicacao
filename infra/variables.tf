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

variable "jwt_secret" {
  description = "Segredo usado para assinar os tokens de sessão (mínimo 32 caracteres). Defina via TF_VAR_jwt_secret — nunca versione o valor."
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.jwt_secret) >= 32
    error_message = "jwt_secret precisa ter ao menos 32 caracteres."
  }
}

variable "cors_allowed_origins" {
  description = "Origens permitidas para o CORS no API Gateway. Vazio por padrão: o app chama /api pelo próprio domínio do CloudFront, então é same-origin e não precisa de CORS. Só preencha (com o domínio do CloudFront e/ou o domínio próprio) se algum cliente for bater direto no API Gateway. Nunca use [\"*\"] — isso libera a API para qualquer site."
  type        = list(string)
  default     = []

  validation {
    condition     = !contains(var.cors_allowed_origins, "*")
    error_message = "cors_allowed_origins não pode conter \"*\". Liste as origens do app explicitamente."
  }
}

variable "cloudfront_price_class" {
  description = "Classe de preço do CloudFront (PriceClass_100 = EUA/Europa — mais barato)"
  type        = string
  default     = "PriceClass_100"
}

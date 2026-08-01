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
  description = "Timeout da Lambda do backend em segundos. O API Gateway corta a resposta em 29s, mas a Lambda continua faturando até retornar — por isso o teto fica curto."
  type        = number
  default     = 30
}

variable "reminders_timeout" {
  description = "Timeout da Lambda de lembretes em segundos. Ela varre as escalas e envia uma notificação por voluntário, em sequência — por isso é bem mais folgado que o do backend."
  type        = number
  default     = 120
}

variable "reminders_memory_size" {
  description = "Memória da Lambda de lembretes em MB"
  type        = number
  default     = 512
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

# ── Notificações push (lembretes de escala) ──
# O par VAPID identifica este servidor perante os serviços de push dos
# navegadores. Trocá-lo invalida todas as inscrições já feitas: cada pessoa
# teria de reativar as notificações no aparelho dela.
variable "vapid_public_key" {
  description = "Chave pública VAPID. Gere com `npm run push:keys` e defina via TF_VAR_vapid_public_key."
  type        = string
  default     = ""
}

variable "vapid_private_key" {
  description = "Chave privada VAPID. Defina via TF_VAR_vapid_private_key — nunca versione o valor. Vazia desliga os lembretes, sem derrubar o resto da aplicação."
  type        = string
  sensitive   = true
  default     = ""

  validation {
    condition     = var.vapid_private_key == "" || length(var.vapid_private_key) >= 32
    error_message = "vapid_private_key precisa ser a chave gerada por `npm run push:keys` (ou ficar vazia para desligar os lembretes)."
  }
}

variable "vapid_subject" {
  description = "Contato que os serviços de push usam para avisar sobre problemas de entrega (mailto: ou https:)"
  type        = string
  default     = "mailto:comunicacao@boladeneve.com"
}

variable "reminders_enabled" {
  description = "Liga os disparos agendados dos lembretes. Desligue para suspender os avisos sem destruir o resto da infraestrutura."
  type        = bool
  default     = true
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

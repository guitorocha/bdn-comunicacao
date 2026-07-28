# ──────────────────────────────────────────────
# Outputs — URLs e informações dos recursos criados
# ──────────────────────────────────────────────

output "cloudfront_url" {
  description = "URL pública da aplicação (CloudFront)"
  value       = "https://${aws_cloudfront_distribution.frontend.domain_name}"
}

output "cloudfront_distribution_id" {
  description = "ID da distribuição CloudFront (use para invalidar cache após deploy)"
  value       = aws_cloudfront_distribution.frontend.id
}

output "s3_bucket_name" {
  description = "Nome do bucket S3 para upload dos arquivos do frontend"
  value       = aws_s3_bucket.frontend.bucket
}

output "api_gateway_url" {
  description = "URL direta do API Gateway (use para testes)"
  value       = aws_apigatewayv2_stage.default.invoke_url
}

output "lambda_function_name" {
  description = "Nome da função Lambda do backend"
  value       = aws_lambda_function.backend.function_name
}

output "dynamodb_tables" {
  description = "Nomes das tabelas DynamoDB criadas"
  value = {
    users     = aws_dynamodb_table.users.name
    requests  = aws_dynamodb_table.requests.name
    subtasks  = aws_dynamodb_table.subtasks.name
    comments  = aws_dynamodb_table.comments.name
  }
}

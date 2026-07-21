# ──────────────────────────────────────────────
# API Gateway v2 — HTTP API (mais barato que REST API)
# Custo: ~$1/milhão de requisições vs ~$3.5 no REST API
# ──────────────────────────────────────────────

resource "aws_apigatewayv2_api" "backend" {
  name          = "${var.app_name}-api"
  protocol_type = "HTTP"
  description   = "HTTP API para o backend do ${var.app_name}"

  cors_configuration {
    allow_origins = var.cors_allowed_origins
    allow_methods = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
    allow_headers = ["Content-Type", "Authorization", "X-Requested-With"]
    # A sessão é um cookie: sem allow_credentials o navegador não o envia numa
    # chamada cross-origin. Fica desligado enquanto a lista de origens estiver
    # vazia (o caminho normal é same-origin pelo CloudFront), porque
    # allow_credentials sem origem explícita não tem uso — e é inválido com "*".
    allow_credentials = length(var.cors_allowed_origins) > 0
    max_age           = 300
  }
}

# Stage padrão com auto-deploy habilitado
resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.backend.id
  name        = var.environment
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api_gateway.arn
    format = jsonencode({
      requestId      = "$context.requestId"
      sourceIp       = "$context.identity.sourceIp"
      requestTime    = "$context.requestTime"
      httpMethod     = "$context.httpMethod"
      routeKey       = "$context.routeKey"
      status         = "$context.status"
      responseLength = "$context.responseLength"
    })
  }

  default_route_settings {
    throttling_burst_limit = 50   # Pico máximo de requisições simultâneas
    throttling_rate_limit  = 20   # Requisições por segundo — suficiente para uso de igreja
  }
}

# CloudWatch Log Group para o API Gateway
resource "aws_cloudwatch_log_group" "api_gateway" {
  name              = "/aws/apigateway/${var.app_name}"
  retention_in_days = 30
}

# Integração Lambda (payload format 2.0 — mais eficiente)
resource "aws_apigatewayv2_integration" "lambda_backend" {
  api_id             = aws_apigatewayv2_api.backend.id
  integration_type   = "AWS_PROXY"
  integration_uri    = aws_lambda_function.backend.invoke_arn
  payload_format_version = "2.0"
}

# Rota catch-all: encaminha TODAS as rotas /api/* para a Lambda
resource "aws_apigatewayv2_route" "proxy_all" {
  api_id    = aws_apigatewayv2_api.backend.id
  route_key = "ANY /api/{proxy+}"
  target    = "integrations/${aws_apigatewayv2_integration.lambda_backend.id}"
}

# Rota raiz da API (para healthcheck)
resource "aws_apigatewayv2_route" "root" {
  api_id    = aws_apigatewayv2_api.backend.id
  route_key = "GET /health"
  target    = "integrations/${aws_apigatewayv2_integration.lambda_backend.id}"
}

# Permissão para API Gateway invocar a Lambda
resource "aws_lambda_permission" "api_gateway" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.backend.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.backend.execution_arn}/*/*"
}

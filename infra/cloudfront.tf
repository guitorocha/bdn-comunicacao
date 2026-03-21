# ──────────────────────────────────────────────
# CloudFront — CDN para frontend + proxy para API
# ──────────────────────────────────────────────

# Origin Access Control (OAC) — substituto moderno do OAI para S3
resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = "${var.app_name}-oac"
  description                       = "OAC para bucket S3 do ${var.app_name}"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

locals {
  s3_origin_id  = "S3-${var.app_name}-frontend"
  api_origin_id = "ApiGateway-${var.app_name}"

  # Domínio do API Gateway sem o prefixo https://
  api_gateway_domain = replace(
    replace(aws_apigatewayv2_stage.default.invoke_url, "https://", ""),
    "/${aws_apigatewayv2_stage.default.name}", ""
  )
}

resource "aws_cloudfront_distribution" "frontend" {
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  price_class         = var.cloudfront_price_class
  comment             = "${var.app_name} — ${var.environment}"
  wait_for_deployment = false

  # ── Origem 1: S3 (Frontend estático) ──
  origin {
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id                = local.s3_origin_id
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id
  }

  # ── Origem 2: API Gateway (Backend Lambda) ──
  origin {
    domain_name = local.api_gateway_domain
    origin_id   = local.api_origin_id
    origin_path = "/${aws_apigatewayv2_stage.default.name}"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  # ── Comportamento padrão: serve o frontend via S3 ──
  default_cache_behavior {
    target_origin_id       = local.s3_origin_id
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    min_ttl     = 0
    default_ttl = 86400   # 1 dia
    max_ttl     = 604800  # 7 dias
  }

  # ── Comportamento para /api/*: encaminha para Lambda ──
  ordered_cache_behavior {
    path_pattern           = "/api/*"
    target_origin_id       = local.api_origin_id
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    # Não faz cache das respostas da API
    forwarded_values {
      query_string = true
      headers      = ["Authorization", "Content-Type", "Origin", "Accept"]
      cookies {
        forward = "all"
      }
    }

    min_ttl     = 0
    default_ttl = 0
    max_ttl     = 0
  }

  # Redireciona 403/404 para index.html (SPA React Router)
  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 10
  }

  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 10
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
    # Para domínio customizado, substitua por:
    # acm_certificate_arn      = aws_acm_certificate.cert.arn
    # ssl_support_method       = "sni-only"
    # minimum_protocol_version = "TLSv1.2_2021"
  }

  depends_on = [aws_apigatewayv2_stage.default]
}

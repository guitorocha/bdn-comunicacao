# ──────────────────────────────────────────────
# IAM — Role e políticas para a Lambda
# ──────────────────────────────────────────────

resource "aws_iam_role" "lambda_exec" {
  name = "${var.app_name}-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })
}

# Permissão básica para Lambda (CloudWatch Logs)
resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# Política customizada: CRUD nas 4 tabelas DynamoDB
resource "aws_iam_role_policy" "lambda_dynamodb" {
  name = "${var.app_name}-lambda-dynamodb-policy"
  role = aws_iam_role.lambda_exec.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "DynamoDBCRUD"
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan",
          "dynamodb:BatchGetItem",
          "dynamodb:BatchWriteItem"
        ]
        Resource = [
          aws_dynamodb_table.users.arn,
          "${aws_dynamodb_table.users.arn}/index/*",
          aws_dynamodb_table.requests.arn,
          "${aws_dynamodb_table.requests.arn}/index/*",
          aws_dynamodb_table.subtasks.arn,
          "${aws_dynamodb_table.subtasks.arn}/index/*",
          aws_dynamodb_table.comments.arn,
          "${aws_dynamodb_table.comments.arn}/index/*",
        ]
      }
    ]
  })
}

# ──────────────────────────────────────────────
# Lambda Function — Backend Express
# ──────────────────────────────────────────────

resource "aws_lambda_function" "backend" {
  function_name = "${var.app_name}-backend"
  description   = "Backend Express da aplicação BDN Comunicação"

  # O ZIP deve ser gerado pelo build (veja scripts/build-lambda.sh)
  filename         = var.lambda_zip_path
  source_code_hash = filebase64sha256(var.lambda_zip_path)

  runtime      = "nodejs20.x"
  handler      = "dist/lambda.handler"  # Exporta 'handler' do entrypoint Lambda
  architectures = ["arm64"]             # Graviton2 — ~20% mais barato que x86_64

  role    = aws_iam_role.lambda_exec.arn
  timeout = var.lambda_timeout
  memory_size = var.lambda_memory_size

  environment {
    variables = {
      NODE_ENV            = var.environment
      DYNAMODB_REGION     = var.aws_region
      TABLE_USERS         = aws_dynamodb_table.users.name
      TABLE_REQUESTS      = aws_dynamodb_table.requests.name
      TABLE_SUBTASKS      = aws_dynamodb_table.subtasks.name
      TABLE_COMMENTS      = aws_dynamodb_table.comments.name
      STAGE               = aws_apigatewayv2_stage.default.name
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.lambda_basic,
    aws_iam_role_policy.lambda_dynamodb,
  ]
}

# CloudWatch Log Group com retenção de 30 dias (evita acúmulo de logs)
resource "aws_cloudwatch_log_group" "lambda_backend" {
  name              = "/aws/lambda/${aws_lambda_function.backend.function_name}"
  retention_in_days = 30
}

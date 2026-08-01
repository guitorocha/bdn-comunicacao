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

# Política customizada: CRUD nas tabelas DynamoDB (audit é append-only, abaixo)
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
          aws_dynamodb_table.schedules.arn,
          "${aws_dynamodb_table.schedules.arn}/index/*",
          aws_dynamodb_table.unavailability.arn,
          "${aws_dynamodb_table.unavailability.arn}/index/*",
        ]
      },
      {
        # A trilha de auditoria é append-only: a Lambda escreve e lê, mas não
        # tem como alterar nem apagar uma entrada. Uma conta de admin
        # comprometida não consegue varrer os próprios rastros pela aplicação.
        Sid    = "DynamoDBAuditAppendOnly"
        Effect = "Allow"
        Action = [
          "dynamodb:PutItem",
          "dynamodb:GetItem",
          "dynamodb:Query",
          "dynamodb:Scan"
        ]
        Resource = [
          aws_dynamodb_table.audit.arn,
          "${aws_dynamodb_table.audit.arn}/index/*",
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
      JWT_SECRET          = var.jwt_secret
      DYNAMODB_REGION     = var.aws_region
      TABLE_USERS         = aws_dynamodb_table.users.name
      TABLE_REQUESTS      = aws_dynamodb_table.requests.name
      TABLE_SUBTASKS      = aws_dynamodb_table.subtasks.name
      TABLE_COMMENTS      = aws_dynamodb_table.comments.name
      TABLE_SCHEDULES      = aws_dynamodb_table.schedules.name
      TABLE_UNAVAILABILITY = aws_dynamodb_table.unavailability.name
      TABLE_AUDIT          = aws_dynamodb_table.audit.name
      STAGE               = aws_apigatewayv2_stage.default.name
      # O backend também assina envio: a rota /api/push/teste manda a
      # notificação de conferência. Sem as chaves ela responde 503 e o resto
      # da aplicação segue normal.
      VAPID_PUBLIC_KEY     = var.vapid_public_key
      VAPID_PRIVATE_KEY    = var.vapid_private_key
      VAPID_SUBJECT        = var.vapid_subject
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

# ──────────────────────────────────────────────
# Lambda Function — Lembretes de escala
#
# Função separada do backend, e não um ramo dentro dele (ver ADR-0008):
#   - o timeout do job (120s) não vira teto de faturamento do request HTTP;
#   - dá para alarmar sobre a métrica de erro DESTA função sem que qualquer
#     500 da API dispare o alarme junto;
#   - a role concede só o que o job usa, em duas tabelas.
# As duas funções compartilham o MESMO ZIP, mudando só o handler — assim uma
# não fica numa versão do código e a outra noutra.
# ──────────────────────────────────────────────

resource "aws_iam_role" "reminders_exec" {
  name = "${var.app_name}-reminders-role"

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

resource "aws_iam_role_policy_attachment" "reminders_basic" {
  role       = aws_iam_role.reminders_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# Menor privilégio: o job lê as escalas e os usuários, grava a marca de
# lembrete enviado e remove inscrição de push que morreu. Não toca em
# solicitações, subtarefas, comentários nem na trilha de auditoria.
resource "aws_iam_role_policy" "reminders_dynamodb" {
  name = "${var.app_name}-reminders-dynamodb-policy"
  role = aws_iam_role.reminders_exec.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "LeituraDeEscalasEUsuarios"
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:Scan",
          "dynamodb:UpdateItem"
        ]
        Resource = [
          aws_dynamodb_table.users.arn,
          aws_dynamodb_table.schedules.arn,
        ]
      }
    ]
  })
}

resource "aws_lambda_function" "reminders" {
  function_name = "${var.app_name}-reminders"
  description   = "Lembretes de escala por notificação push (EventBridge Scheduler)"

  filename         = var.lambda_zip_path
  source_code_hash = filebase64sha256(var.lambda_zip_path)

  runtime       = "nodejs20.x"
  handler       = "dist/lembretes.handler"
  architectures = ["arm64"]

  role        = aws_iam_role.reminders_exec.arn
  timeout     = var.reminders_timeout
  memory_size = var.reminders_memory_size

  environment {
    variables = {
      NODE_ENV        = var.environment
      DYNAMODB_REGION = var.aws_region
      # Só as tabelas que o job usa — as demais nem são referenciadas
      TABLE_USERS     = aws_dynamodb_table.users.name
      TABLE_SCHEDULES = aws_dynamodb_table.schedules.name
      # Sem as chaves o job registra "push desligado" no log e encerra sem enviar
      VAPID_PUBLIC_KEY  = var.vapid_public_key
      VAPID_PRIVATE_KEY = var.vapid_private_key
      VAPID_SUBJECT     = var.vapid_subject
      # Sem JWT_SECRET de propósito: este bundle não importa `tokens.ts` e o job
      # não emite sessão nenhuma.
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.reminders_basic,
    aws_iam_role_policy.reminders_dynamodb,
  ]
}

resource "aws_cloudwatch_log_group" "lambda_reminders" {
  name              = "/aws/lambda/${aws_lambda_function.reminders.function_name}"
  retention_in_days = 30
}

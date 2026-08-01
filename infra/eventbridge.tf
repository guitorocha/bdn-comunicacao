# ──────────────────────────────────────────────
# EventBridge Scheduler — lembretes de escala
#
# Dois disparos invocam a Lambda `reminders` (infra/lambda.tf), separada do
# backend — ver ADR-0008. O payload diz apenas qual dos dois lembretes rodar.
#
# Por que Scheduler e não `aws_cloudwatch_event_rule`: a regra clássica só
# aceita cron em UTC, o que obrigaria a escrever 12:00 quando se quer 09:00 e a
# corrigir tudo à mão se o Brasil voltar ao horário de verão. Aqui o fuso é
# declarado e a AWS resolve.
# ──────────────────────────────────────────────

resource "aws_iam_role" "scheduler" {
  name = "${var.app_name}-scheduler-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "scheduler.amazonaws.com"
        }
      }
    ]
  })
}

# O Scheduler só pode invocar a função de lembretes — não alcança o backend
resource "aws_iam_role_policy" "scheduler_invoke" {
  name = "${var.app_name}-scheduler-invoke-policy"
  role = aws_iam_role.scheduler.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "InvokeRemindersLambda"
        Effect   = "Allow"
        Action   = ["lambda:InvokeFunction"]
        Resource = [aws_lambda_function.reminders.arn]
      }
    ]
  })
}

# Segunda-feira, 09h: as escalas da semana inteira, uma notificação por pessoa
resource "aws_scheduler_schedule" "lembrete_semana" {
  count = var.reminders_enabled ? 1 : 0

  name       = "${var.app_name}-lembrete-semana"
  group_name = "default"

  schedule_expression          = "cron(0 9 ? * MON *)"
  schedule_expression_timezone = "America/Sao_Paulo"

  # O lembrete tem hora certa: chegar às 10h30 porque a AWS "flexibilizou" a
  # janela seria pior do que não chegar.
  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = aws_lambda_function.reminders.arn
    role_arn = aws_iam_role.scheduler.arn
    input    = jsonencode({ tipo = "semana" })

    retry_policy {
      # Duas tentativas bastam: a marca de idempotência é gravada antes do
      # envio, então uma repetição não notifica ninguém duas vezes.
      maximum_retry_attempts       = 2
      maximum_event_age_in_seconds = 3600
    }
  }
}

# Todo dia, 07h: só as escalas daquele dia. Nos dias sem culto o job varre as
# escalas, não encontra nada e encerra — mais barato que manter uma lista de
# dias de culto em dois lugares.
resource "aws_scheduler_schedule" "lembrete_dia" {
  count = var.reminders_enabled ? 1 : 0

  name       = "${var.app_name}-lembrete-dia"
  group_name = "default"

  schedule_expression          = "cron(0 7 * * ? *)"
  schedule_expression_timezone = "America/Sao_Paulo"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = aws_lambda_function.reminders.arn
    role_arn = aws_iam_role.scheduler.arn
    input    = jsonencode({ tipo = "dia" })

    retry_policy {
      maximum_retry_attempts       = 2
      maximum_event_age_in_seconds = 3600
    }
  }
}

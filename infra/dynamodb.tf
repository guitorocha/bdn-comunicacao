# ──────────────────────────────────────────────
# DynamoDB — Banco de dados (on-demand / PAY_PER_REQUEST)
# Custo: grátis até 25 GB e 25 WCU/RCU no Free Tier
# ──────────────────────────────────────────────

# ── Tabela: users ──
# PK: id (Number)
# GSI: username-index → para busca por username
resource "aws_dynamodb_table" "users" {
  name         = "${var.app_name}-users"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "N"
  }

  attribute {
    name = "username"
    type = "S"
  }

  global_secondary_index {
    name            = "username-index"
    hash_key        = "username"
    projection_type = "ALL"
  }

  tags = {
    Table = "users"
  }
}

# ── Tabela: requests ──
# PK: id (Number)
# GSI: ministry-date-index → para verificação de conflitos (ministry + eventDate)
resource "aws_dynamodb_table" "requests" {
  name         = "${var.app_name}-requests"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "N"
  }

  attribute {
    name = "ministry"
    type = "S"
  }

  attribute {
    name = "eventDate"
    type = "S"
  }

  global_secondary_index {
    name            = "ministry-date-index"
    hash_key        = "ministry"
    range_key       = "eventDate"
    projection_type = "ALL"
  }

  tags = {
    Table = "requests"
  }
}

# ── Tabela: subtasks ──
# PK: id (Number)
# GSI: requestId-index → para busca por requestId
resource "aws_dynamodb_table" "subtasks" {
  name         = "${var.app_name}-subtasks"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "N"
  }

  attribute {
    name = "requestId"
    type = "N"
  }

  global_secondary_index {
    name            = "requestId-index"
    hash_key        = "requestId"
    projection_type = "ALL"
  }

  tags = {
    Table = "subtasks"
  }
}

# ── Tabela: comments ──
# PK: id (Number)
# GSI: requestId-index → para busca por requestId
resource "aws_dynamodb_table" "comments" {
  name         = "${var.app_name}-comments"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "N"
  }

  attribute {
    name = "requestId"
    type = "N"
  }

  global_secondary_index {
    name            = "requestId-index"
    hash_key        = "requestId"
    projection_type = "ALL"
  }

  tags = {
    Table = "comments"
  }
}

# ── Tabela: unavailability ──
# PK: id (Number) — dias em que voluntários não podem servir (escalas)
# GSI: userId-index → para busca por usuário
resource "aws_dynamodb_table" "unavailability" {
  name         = "${var.app_name}-unavailability"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "N"
  }

  attribute {
    name = "userId"
    type = "N"
  }

  global_secondary_index {
    name            = "userId-index"
    hash_key        = "userId"
    projection_type = "ALL"
  }

  tags = {
    Table = "unavailability"
  }
}

# ── Tabela: audit ──
# PK: id (Number) — trilha append-only de login, bloqueio e ações de admin.
# Sem GSI: o volume é pequeno e a leitura é sempre "as últimas N entradas".
# A política IAM da Lambda concede apenas PutItem/Scan aqui — nada de
# UpdateItem ou DeleteItem, para que a trilha não possa ser reescrita.
resource "aws_dynamodb_table" "audit" {
  name         = "${var.app_name}-audit"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "N"
  }

  # A trilha é a prova depois de um incidente: apagá-la por engano é caro
  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Table = "audit"
  }
}

# ── Tabela: schedules ──
# PK: id (Number) — escalas de cultos e eventos especiais
resource "aws_dynamodb_table" "schedules" {
  name         = "${var.app_name}-schedules"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "N"
  }

  tags = {
    Table = "schedules"
  }
}

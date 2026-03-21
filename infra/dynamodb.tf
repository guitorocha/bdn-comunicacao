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

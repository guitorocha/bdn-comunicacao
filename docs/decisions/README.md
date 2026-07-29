# Registros de Decisão de Arquitetura (ADRs)

Um ADR documenta **uma escolha técnica que tinha alternativas reais**, o contexto em que foi
tomada e o que ela custa. Ele não descreve como o código funciona — isso é papel do próprio
código e da [arquitetura](../architecture/overview.md).

## Quando escrever um ADR

Escreva quando a resposta a "por que não do jeito óbvio?" levar mais de duas frases, ou
quando a decisão:

- for cara de reverter (banco, autenticação, formato de deploy);
- contrariar uma prática comum, de propósito;
- emendar a [constituição](../constitution.md);
- for a segunda vez que alguém pergunta a mesma coisa.

Não escreva ADR para escolha de biblioteca trivial ou detalhe de implementação local.

## Formato

```markdown
# ADR-NNNN — Título no imperativo

- **Status:** Proposta | Aceita | Substituída por ADR-XXXX | Obsoleta
- **Data:** AAAA-MM-DD
- **Contexto:** o que era verdade quando a decisão foi tomada
- **Decisão:** o que foi decidido
- **Alternativas consideradas:** e por que foram rejeitadas
- **Consequências:** o que ganhamos, o que pagamos, o que passou a ser proibido
```

**ADR não se edita para mudar de ideia.** Mudou a decisão? Escreva um novo ADR e marque o
antigo como "Substituída por ADR-XXXX". O histórico é o valor.

## Índice

| ADR | Decisão | Status |
|---|---|---|
| [0001](ADR-0001-dynamodb-como-persistencia.md) | DynamoDB como banco, com `IStorage` como fronteira | Aceita |
| [0002](ADR-0002-drizzle-como-fonte-de-tipos.md) | Schema Drizzle/Postgres usado só como fonte de tipos | Aceita (com dívida) |
| [0003](ADR-0003-sessao-jwt-em-cookie-httponly.md) | Sessão em JWT dentro de cookie HttpOnly | Aceita |
| [0004](ADR-0004-bloqueio-permanente-de-conta.md) | Bloqueio permanente após 8 senhas erradas | Aceita |
| [0005](ADR-0005-conta-raiz-admin.md) | Conta raiz `admin` com privilégios especiais | Aceita |
| [0006](ADR-0006-treinamento-como-funcao-de-escala.md) | "Treinamento" como função de escala | Aceita |
| [0007](ADR-0007-serverless-cloudfront-lambda.md) | CloudFront + S3 + API Gateway + Lambda + DynamoDB | Aceita |

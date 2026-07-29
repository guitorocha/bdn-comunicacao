# ADR-0004 — Bloqueio permanente da conta após 8 senhas erradas consecutivas

- **Status:** Aceita
- **Data:** 2026-07 (commit `93f3a51`)
- **Relacionada:** [spec 003](../specs/003-autenticacao-e-contas.md), [ADR-0005](ADR-0005-conta-raiz-admin.md)

## Contexto

O login já tinha rate limit: 30 falhas/15 min por IP e 10 falhas/15 min por conta. Isso
segura a força bruta rápida, mas **não** segura o ataque lento e distribuído: quem tem
muitos IPs e paciência espera a janela virar e continua adivinhando, indefinidamente.

Agravante do ambiente: o estado do `express-rate-limit` fica **em memória, por container
Lambda**. Com várias instâncias quentes, o limite efetivo é maior que o configurado.

Contexto humano: a equipe é pequena e se conhece. Há sempre outro administrador acessível
por WhatsApp para destravar uma conta.

## Decisão

Contar senhas erradas **consecutivas** por conta (`failedLoginCount`, persistido). Ao
atingir `MAX_FAILED_LOGINS = 8`, gravar `lockedAt` e **bloquear a conta em definitivo**:

- não há prazo que destrave sozinha;
- a conta não abre nem com a senha correta;
- um login bem-sucedido zera o contador;
- `isLocked` é verificado **no middleware de autenticação**, não só no login — bloquear
  derruba as sessões abertas;
- saídas: `POST /api/users/:id/unlock` por qualquer admin, ou um reset de senha (que também
  destrava).

A mensagem ao usuário bloqueado é explícita ("Conta bloqueada por tentativas de senha
incorretas. Peça a um administrador para desbloqueá-la.") e, portanto, **revela que a conta
existe**.

## Alternativas consideradas

| Alternativa | Por que não |
|---|---|
| **Bloqueio temporário (15 min, backoff exponencial)** | Devolve ao atacante a chance de voltar quando a janela virar — exatamente o ataque que motivou a decisão |
| **Só rate limit** | Não sobrevive ao ataque distribuído nem ao estado em memória por container |
| **CAPTCHA após N falhas** | Dependência de terceiro, custo de integração e atrito para uma equipe de dezenas de pessoas |
| **2FA** | Resolveria melhor, mas exige app autenticador para todo voluntário e um fluxo de recuperação que não existe. Desproporcional ao contexto |
| **Mensagem genérica para conta bloqueada** | Evitaria enumeração, mas deixaria a pessoa sem saber por que a senha certa não entra nem a quem pedir. O bloqueio já tira o valor da enumeração: a conta não abre de qualquer forma |

## Consequências

**Ganhos**
- Adivinhação de senha tem teto absoluto: 8 tentativas por conta, para sempre.
- A defesa é **persistida no DynamoDB**, então não tem o furo do estado em memória.
- Bloquear derruba a sessão do atacante junto.

**Custos aceitos**
- **Negação de serviço direcionada:** quem souber o `username` de alguém pode trancar
  aquela conta com 8 palpites errados. Aceito porque (a) a equipe é fechada, (b) um admin
  destrava em minutos, e (c) a alternativa é deixar a adivinhação seguir indefinidamente.
- **Dependência de intervenção humana.** Sem admin disponível, a pessoa fica de fora.
- **A mensagem confirma a existência da conta.** Decisão consciente (acima).
- Falha comum de login mantém mensagem única para conta inexistente e senha errada — a
  enumeração só é possível pela via do bloqueio.

**Proteção da recuperação**
Qualquer admin pode desbloquear **inclusive a conta raiz** `admin`. Sem essa exceção, oito
palpites errados em `@admin` trancariam a via de recuperação do sistema, e a única saída
seria editar o DynamoDB na mão. Ver [ADR-0005](ADR-0005-conta-raiz-admin.md).

## Quando revisitar

Se o bloqueio direcionado virar incômodo real (alguém trancando contas de propósito), o
caminho é 2FA ou desbloqueio com prazo **longo** (24 h) — não voltar ao bloqueio curto.

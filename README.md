# Comunicação BDN

Sistema de gestão do Ministério de Comunicação da **Igreja Bola de Neve Nação** — Itaquera,
São Paulo.

Duas áreas:

- **Solicitações de divulgação** — qualquer ministério da igreja envia um pedido (sem login),
  recebe um número de protocolo e acompanha o andamento; a equipe toca o pedido num painel
  interno com status, subtarefas e comentários.
- **Escalas de voluntários** — funções de cada pessoa (fotografia, filmmaker, projeção,
  transmissão e treinamento), registro de indisponibilidade por período do dia, criação
  manual de escalas, geração automática por rodízio e aviso de sobrecarga.

## Stack

React 18 + TypeScript + Vite + Tailwind/shadcn no front; Express 5 empacotado como função
Lambda no back; DynamoDB como banco; tudo servido por uma distribuição CloudFront (S3 para o
front, API Gateway para a API). Infraestrutura em Terraform.

## Começar

```bash
npm install
npm run dev     # http://localhost:5000
```

Em desenvolvimento o armazenamento é em memória, com usuários semeados — a senha é impressa
no console na inicialização (ou defina `DEV_SEED_PASSWORD`). Nenhum banco local é necessário.

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento (API + front com HMR) |
| `npm run check` | Verificação de tipos — o portão de qualidade do projeto |
| `npm run build` | Build do cliente e do servidor + `dist/lambda.zip` |
| `npm start` | Executa o build de produção (**usa o DynamoDB real**) |

Detalhes em [`docs/guides/development.md`](docs/guides/development.md).

## Documentação

A documentação segue **Spec-Driven Development** e vive em [`docs/`](docs/):

| | |
|---|---|
| [Índice da documentação](docs/README.md) | Mapa de tudo |
| [Constituição](docs/constitution.md) | Princípios que nenhuma mudança quebra |
| [Visão de produto](docs/product/overview.md) | Problema, atores, glossário, jornadas |
| [Especificações](docs/specs/) | Comportamento esperado de cada funcionalidade |
| [Arquitetura](docs/architecture/overview.md) | Como as peças se encaixam |
| [Decisões (ADRs)](docs/decisions/) | Por que foi feito assim |
| [Guias](docs/guides/) | Desenvolvimento, deploy e playbook para agentes de IA |
| [Backlog](docs/backlog.md) | Lacunas e dívidas conhecidas |

Trabalhando com um agente de IA neste repositório? Comece por
[`CLAUDE.md`](CLAUDE.md) e por
[`docs/guides/ai-agent-playbook.md`](docs/guides/ai-agent-playbook.md).

## Deploy

Manual, em três passos (build → `terraform apply` → sync do S3 + invalidação do CloudFront).
Custo estimado: **menos de US$ 1/mês**. Ver
[`docs/guides/deployment.md`](docs/guides/deployment.md) e
[`infra/README.md`](infra/README.md).

## Licença

MIT.

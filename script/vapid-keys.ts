import webpush from "web-push";

// Gera o par de chaves VAPID que identifica este servidor perante os serviços
// de push (Google, Mozilla, Apple). Roda uma vez, na mão: a chave privada é
// segredo de produção e vai para o Terraform como TF_VAR_vapid_private_key —
// nunca para o repositório.
//
// Trocar o par depois invalida TODAS as assinaturas já registradas: cada
// aparelho precisaria reativar as notificações. É o mesmo peso de trocar o
// JWT_SECRET, e pelo mesmo motivo não se faz de passagem.

const { publicKey, privateKey } = webpush.generateVAPIDKeys();

console.log(`
Chaves VAPID geradas. Guarde a privada como segredo.

Para o desenvolvimento local (o projeto não carrega .env — exporte no shell
antes do npm run dev):

  $env:VAPID_PUBLIC_KEY="${publicKey}"
  $env:VAPID_PRIVATE_KEY="${privateKey}"
  $env:VAPID_SUBJECT="mailto:comunicacao@boladeneve.com"

Para a produção, antes do terraform apply:

  $env:TF_VAR_vapid_public_key="${publicKey}"
  $env:TF_VAR_vapid_private_key="${privateKey}"
`);

# Política de Cancelamento de Pedidos

**Documento:** POL-CANCELAMENTO v1.2  
**Vigência:** a partir de 2026-01-01

## Quando é possível cancelar

O cancelamento é permitido somente quando o campo `canCancel` do pedido estiver `true`. Em geral isso ocorre enquanto o pedido está em `processing`, `shipped` ou `delayed` e ainda não foi entregue.

Pedidos com status `delivered` ou `cancelled` **não** podem ser cancelados por este canal.

## Confirmação obrigatória

Toda solicitação de cancelamento exige **confirmação explícita** do cliente (por exemplo: "sim" ou "confirmo") antes do registro. O assistente não deve cancelar apenas com a intenção implícita.

## Autorização

O cliente só pode cancelar pedidos do próprio `customerId`. Tentativas envolvendo pedidos de terceiros devem ser recusadas sem confirmar se o pedido existe.

## Registro

Após confirmação e validação, o sistema registra a solicitação, altera o status para `cancelled` e define `canCancel` como `false`.

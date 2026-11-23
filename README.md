# Banco Escola — Simulador de movimentações bancárias (projeto acadêmico)

Projeto full-stack construído a partir do repositório `formulario-angular`. A aplicação foi reformulada de questionário para **controle de contas bancárias fictícias**. Todo valor, conta, saldo, forma de pagamento e lançamento existe apenas para demonstração. **NÃO realiza transferências, PIX, saques nem cobranças reais.**

## Tecnologias
- **Frontend:** Angular 22, TypeScript, HTML e CSS responsivo.
- **Backend:** Node.js 24 e API HTTP nativa (sem Express).
- **Banco:** SQLite nativo (`node:sqlite`).
- **Autenticação local:** token administrativo em variável de ambiente (exemplo acadêmico).

## Executar no Windows (sem Python)

Pré-requisitos: Git, Node.js 24 e npm.

Se você já tem o projeto no computador:
```powershell
cd "$HOME\Desktop\formulario-angular"
git pull origin main
npm ci
```

Abra **dois PowerShells** na pasta do projeto.

**PowerShell 1 — Backend**
```powershell
$env:FORMS_ADMIN_TOKEN="defina-uma-chave-diferente-com-16-caracteres-ou-mais"
npm run backend
```
A API roda em `http://127.0.0.1:8000`.

**PowerShell 2 — Frontend**
```powershell
npm start
```
Acesse `http://localhost:4200` e faça login com o token configurado no terminal 1.

Para verificar se o servidor está ativo: `http://127.0.0.1:8000/api/health`.

## Funcionalidades
- Três contas fictícias pré-cadastradas, com identificadores **SIM-00001** etc. e agência **DEMO**.
- Cadastro de novas contas de demonstração.
- Formulário para **entrada ou saída** com valor, data da movimentação, descrição, referência fictícia e forma de pagamento.
- Métodos: PIX simulado, transferência simulada, boleto simulado, cartão de débito simulado e dinheiro fictício.
- Saldo calculado pelo histórico de lançamentos em **centavos inteiros**.
- Bloqueio de saídas que causariam saldo negativo, inclusive retroativamente.
- Extrato bancário com data, tipo, método, identificação, valor e saldo após movimentação.
- Filtros de data inicial e final, entradas/saídas e método de pagamento.
- Exportação de extrato em CSV.
- Dashboard com saldos e totais de entradas e saídas exibidas.
- Dados persistidos em `backend/forms.sqlite3`; se o banco já existir do projeto antigo, suas tabelas antigas ficam preservadas e as tabelas do banco fictício são adicionadas.

## Regras principais
- Não são feitas transações reais. As contas não têm agência/número bancário válidos.
- Valores são inteiros em centavos, não números de ponto flutuante.
- Contas começam com saldo zero; lançamentos iniciais das contas de amostra foram semeados.
- Entradas aumentam o saldo; saídas diminuem.
- Movimentações registradas são **imutáveis** nesta versão para preservar a trilha do extrato.
- O saldo após lançamento é recalculado por data de ocorrência e ID.
- Um lançamento retroativo é recusado se deixar qualquer saldo histórico negativo.
- Em nova instalação, são criadas 3 contas e 10 movimentações de exemplo.

## API
Todos os endpoints abaixo, exceto health, exigem header `Authorization: Bearer SEU_TOKEN`.

| Método | Endpoint | Finalidade |
|---|---|---|
| GET | /api/health | Verificar servidor |
| GET | /api/bank/accounts | Listar contas e saldos |
| POST | /api/bank/accounts | Criar conta fictícia |
| GET | /api/bank/entries?accountId=1 | Extrato |
| POST | /api/bank/entries | Nova entrada ou saída |
| GET | /api/bank/statement.csv?accountId=1 | Exportar CSV |

O extrato aceita os filtros opcionais `from=AAAA-MM-DD`, `to=AAAA-MM-DD`, `kind=entrada|saida` e `method=`.

Exemplo de lançamento enviado pelo frontend:
```json
{
  "accountId": 1,
  "kind": "saida",
  "amountCents": 15990,
  "occurredOn": "2026-11-23",
  "method": "PIX simulado",
  "description": "Pagamento de teste",
  "reference": "MOV-001"
}
```

## Testes

```powershell
npm run test:backend
npm run build
npm test
```

## Segurança e limitações
Este é um **protótipo acadêmico local**, não um software bancário de produção. Em uma aplicação bancária real seriam necessários autenticação forte, segregação de permissões, auditoria, conciliação, compliance, criptografia, validação institucional, prevenção a fraudes, backups e infraestrutura adequada. Não publique dados pessoais reais, credenciais ou o arquivo SQLite no GitHub.

O token é usado somente para acesso local e não deve ser incluído no repositório. O sistema foi idealizado para testes; não hospede publicamente sem reforços de segurança.

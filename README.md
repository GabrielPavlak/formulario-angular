# Banco Escola — Banco Digital de Demonstração

**Projeto acadêmico full-stack com aparência de aplicativo bancário brasileiro**, desenvolvido com Angular 22, Node.js 24 e SQLite. Todos os dados, saldos, Pix, cartões e comprovantes são **fictícios**; nenhum valor é transferido fora do simulador.

> Esta versão adiciona uma experiência de superapp: menu lateral no desktop, navegação inferior no celular, painel moderno, saldo ocultável, cartões demonstrativos, pesquisa de extrato, favoritos, alertas internos e limites de Pix configuráveis. A experiência visual é original, inspirada em padrões de aplicativos digitais — sem copiar identidade ou elementos de marcas reais.

## Refinamento de entrega

Esta versão acrescenta **conferência antes da confirmação de Pix e boletos fictícios**, gráfico mensal com tabela acessível, proteção contra duplicidade de boleto por referência e gravação atômica de movimentação/categoria/auditoria.

A documentação técnica, os critérios de aceite e o roteiro de apresentação estão em [**docs/RELATORIO-TECNICO-ENTREGA.md**](docs/RELATORIO-TECNICO-ENTREGA.md).

Verificação completa: `npm run check` (build de produção, testes Angular e testes Node.js/SQLite).

## Visão geral da interface

- **Início:** saudação, saldo em destaque com privacidade, agência e conta DEMO, mini cartão, atalhos para Pix/Pagar/Depositar/Guardar, resumo financeiro, últimos registros, análise de gastos e agendamentos pendentes.
- **Pix e transferências:** contatos frequentes, transferência atômica entre contas fictícias, validação de saldo, limites por operação/dia e comprovantes demonstrativos.
- **Extrato inteligente:** pesquisa por descrição/referência, filtros por período, método, tipo e categoria, comprovante por registro e exportação CSV.
- **Segurança:** esconder saldos na sessão, simulação de limites diários e por operação, opção de sair do simulador.
- **Avisos e ajuda:** agendamentos pendentes e atividades recentes, instruções de uso e FAQ acadêmico.
- **Responsividade:** barra lateral para computador, barra de navegação inferior no celular, acessos rápidos, campos e botões adaptáveis.

### Fluxo de apresentação recomendado

1. Inicie o backend e o Angular, faça login com o token local.
2. Mostre o painel de saldo, cartões e gastos da Conta Demonstração A.
3. Abra Pix, selecione Conta Demonstração B, transfira R$ 25,00 fictícios e confira o comprovante.
4. Troque para Conta Demonstração B e veja o crédito correspondente.
5. Volte à primeira conta, abra o extrato e filtre a descrição da transferência.
6. Salve a segunda conta nos favoritos e demonstre a função de limites de transferência.
7. Crie uma meta, guarde R$ 10,00 fictícios e mostre a diferença entre saldo disponível e reservado.
8. Exiba o bloqueio de cartão e a central de avisos; exporte o extrato CSV.

**Importante:** o sistema **não** tem login real por cliente; o token é de operador único e todas as contas DEMO são acessíveis a esse operador. O objetivo é demonstrar interface, API, persistência, regras de negócio e testes.

---

> **SIMULAÇÃO.** O Banco Escola é um aplicativo educacional de controle de dinheiro **fictício**. Não realiza pagamentos, Pix, compensação de boletos, investimentos, autorização de cartões ou transferências bancárias reais. Nenhum saldo representa depósito bancário verdadeiro.

Este projeto aproveita o repositório original `formulario-angular` e preserva **Angular 22 no frontend, Node.js 24 no backend e SQLite** como banco local. Sem Python.

## Funcionalidades implementadas

| Área | Funções demonstrativas |
|---|---|
| Início | Saldo em conta, total reservado, patrimônio fictício e ações rápidas |
| Contas | 3 contas pré-cadastradas; criação de outras com identificadores SIM-XXXXX |
| Movimentações | Entradas/saídas, descrição, categoria, data, referência e método de pagamento |
| Pix / Transferências | Transferência interna entre contas DEMO; débito e crédito atômicos, chave de idempotência e comprovante demonstrativo |
| Pagamentos | Pagamento **fictício** de boleto por identificação DEMO, beneficiário, valor e vencimento |
| Extrato | Datas, movimentos, filtros, saldo após lançamento, exportação CSV e comprovantes fictícios |
| Agendamentos | Pix interno ou boleto demonstrativo com data, execução **manual** no vencimento e cancelamento |
| Metas | Caixinhas de reserva com objetivo; guardar e resgatar com saldo consistente |
| Cartões | Cartão de débito fictício com identificação não financeira; bloquear/desbloquear |
| Gastos | Categorias, análise por mês, resumo de receitas/despesas e limites orientativos de orçamento |
| Atividades | Registro das ações administrativas e movimentações específicas |

A aplicação começa com 3 contas e registros bancários de exemplo, a menos que já exista um banco de dados local com contas cadastradas.

## Regras importantes

1. Cada valor é registrado como **inteiro em centavos**, evitando arredondamento financeiro de ponto flutuante.
2. Uma saída ou uma transferência que deixe saldo histórico negativo é recusada pelo backend.
3. Transferências entre contas da demonstração são executadas em **uma transação SQLite** com crédito e débito vinculados.
4. O campo `requestKey` torna a mesma transferência idempotente — repetir a requisição com a mesma chave não duplica o pagamento.
5. Guardar dinheiro em uma meta reduz o saldo de conta e aumenta o saldo reservado; resgatar faz a operação inversa.
6. Um cartão de demonstração bloqueado impede saídas com método "Cartão de débito simulado".
7. O agendamento só é executado ao clicar em **Executar** na data programada ou depois. **Não há processo automático em background**.
8. Extratos e comprovantes têm avisos de que não representam documentos bancários autênticos.
9. Lançamentos históricos são imutáveis na interface, para manter uma trilha de auditoria simples.

## Instalação no Windows

Pré-requisitos: **Node.js 24**, npm e Git.

Primeira instalação:
```powershell
git clone https://github.com/GabrielPavlak/formulario-angular.git
cd formulario-angular
npm ci
```

Se você já tem a pasta:
```powershell
cd "$HOME\Desktop\formulario-angular"
git fetch origin
git switch main
git pull origin main
npm ci
```

Abra **dois terminais** na pasta do projeto.

**Terminal 1 — API e SQLite:**
```powershell
$env:FORMS_ADMIN_TOKEN = "escolha-uma-chave-local-de-mais-de-16-caracteres"
npm run backend
```

**Terminal 2 — Angular:**
```powershell
npm start
```

Abra **http://localhost:4200** e informe o token configurado no primeiro terminal. A saúde da API está em http://127.0.0.1:8000/api/health.

**Importante:** o sistema usa token de operador único para fins de demonstração, **não** autenticação bancária por cliente. Não publique o token no GitHub, em screenshots ou e-mails.

## Organização do código

```text
src/app/app.ts             Estado e integração de serviços Angular
src/app/app.html           Telas e formulários do aplicativo
src/app/app.css            Interface responsiva
backend/server.mjs         Ledger de contas, lançamentos, extrato, autenticação e inicialização SQLite
backend/features.mjs       Transferências, pagamentos, metas, cartões, agendamentos e análises
backend/experience.mjs     Favoritos e limites de operações fictícias
backend/experience.test.mjs Testes de favoritos, limites e busca de extratos
backend/server.test.mjs    Testes iniciais e validações básicas
backend/features.test.mjs  Testes de fluxos completos, saldos, segurança e idempotência
proxy.conf.json            Proxy do Angular para a API na porta 8000
```

O banco local é criado em **backend/forms.sqlite3**. Bancos já existentes são mantidos e novas tabelas são criadas com `CREATE TABLE IF NOT EXISTS`. O SQLite **não deve ser enviado ao GitHub**.

## API (principais rotas)

Todas as rotas `/api/bank/*` exigem `Authorization: Bearer <token>`.

- `GET /api/health`: estado do servidor (público)
- `GET /api/bank/accounts` e `POST /api/bank/accounts`: contas
- `GET /api/bank/entries?accountId=1` e `POST /api/bank/entries`: extrato e lançamentos
- `GET /api/bank/statement.csv?accountId=1`: CSV
- `POST /api/bank/transfer`: transferência fictícia interna
- `GET /api/bank/transfer/:id/receipt`: comprovante demonstrativo
- `POST /api/bank/bills`: simular pagamento
- `GET,POST /api/bank/goals` e `POST /api/bank/goals/:id/move`: metas
- `GET,POST /api/bank/schedules`: agendamentos; `POST /api/bank/schedules/:id/execute|cancel`
- `GET /api/bank/cards?accountId=1` e `POST /api/bank/cards/:id/toggle`: cartão de demonstração
- `GET /api/bank/analytics?accountId=1&month=2026-11`: análises
- `PUT /api/bank/budgets`: limites por categoria
- `GET /api/bank/activity?accountId=1`: trilha de atividades
- `GET /api/bank/receipts/:entryId?accountId=1`: recibo de lançamento

## Testes e validação

```powershell
npm run test:backend
npm run build
npm test
```

O GitHub Actions também compila Angular e roda a suíte do backend a cada alteração relevante.

## Referências de funcionalidades estudadas

- Banco Central: Pix e Pix Agendado — https://www.bcb.gov.br/estabilidadefinanceira/PIX
- Itaú: Aplicativo e serviços — https://www.itau.com.br/app-itau
- Inter: Super Extrato — https://ajuda.inter.co/conta-digital-pessoa-fisica-e-mei/quais-as-funcoes-disponiveis-no-super-extrato/
- Nubank: Assistente de Pagamentos — https://nubank.com.br/nu/conta/assistente-de-pagamentos
- OWASP: API Security Top 10 — https://owasp.org/API-Security/

São **referências de pesquisa**, não vínculos comerciais ou integrações com esses bancos.

## Limitações — não é um app bancário real

Por motivos de segurança e escopo acadêmico, **não** há suporte a Pix verdadeiro, chave Pix de pessoa real, geração de QR bancário, boletos válidos, Open Finance, empréstimos reais, cartão com PAN/CVV, investimentos remunerados, compra e venda de ativos, KYC/CPF, múltiplas contas autenticadas individualmente, biometria ou implantação pública certificada.

Para um software financeiro real seriam indispensáveis autenticação e autorização por cliente, mecanismos antifraude, MFA, proteção contra repetição e bots, trilhas imutáveis de auditoria, segregação de contas, testes de segurança, criptografia, conformidade regulatória, gestão de risco, LGPD e infraestrutura de produção. Não use este protótipo para dinheiro real.

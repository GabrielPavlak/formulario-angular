# MeuForms — Full-Stack com Angular + Node.js + SQLite

O projeto original em Angular foi preservado e integrado a uma API Node.js. **Não é necessário instalar Python.**

## Requisitos

- Node.js 24 LTS ou superior compatível com o Angular instalado
- npm (incluso no Node.js)

## Executar no Windows (PowerShell)

Abra **dois terminais** na pasta do repositório.

**Terminal 1 — servidor / banco de dados:**

```powershell
$env:FORMS_ADMIN_TOKEN = "escolha-uma-chave-bem-longa-e-segura"
npm run backend
```

**Terminal 2 — interface Angular:**

```powershell
npm ci
npm start
```

Acesse `http://localhost:4200`. Para administrar as perguntas e consultar as respostas, clique em **Editor** e informe o token definido no primeiro terminal.

O banco SQLite é criado automaticamente em `backend/forms.sqlite3` na primeira execução. A API Node.js usa somente recursos nativos do Node, sem Express e sem instalação de bibliotecas no backend. O Angular encaminha as chamadas `/api` ao servidor na porta 8000 por meio de `proxy.conf.json`.

## Funcionalidades

- Pesquisa inicial pronta sobre Inteligência Artificial e Segurança Digital, com 14 perguntas
- Editor de perguntas e opções, duplicação, remoção, organização e campos obrigatórios
- Envio de respostas para o servidor, armazenadas em SQLite
- Área administrativa protegida com token
- Consulta, exportação CSV e exclusão de respostas
- Validação de alternativas e campos obrigatórios no backend
- Layout responsivo

## Comandos e testes

```powershell
npm run backend
npm run test:backend
npm run build
npm test
```

## Rotas de API

- `GET /api/health` — status público
- `GET /api/form` — formulário público
- `POST /api/responses` — envio de respostas
- `GET /api/responses` — respostas (admin)
- `GET /api/responses.csv` — CSV (admin)
- `PUT /api/form` — editar formulário (admin)
- `DELETE /api/responses` — remover respostas (admin)

Administração requer `Authorization: Bearer <token>`.

## Segurança e produção

Este projeto é adequado como base acadêmica e desenvolvimento local. Para acesso público na internet, configure HTTPS, autenticação de usuários, proteção contra spam, política de privacidade e retenção de dados. O limitador de frequência por IP é básico. O token não deve ser publicado. O banco `*.sqlite3` não deve ser commitado no GitHub. Edições das perguntas não migram respostas já existentes.

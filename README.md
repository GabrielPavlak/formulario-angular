# MeuForms — Pesquisa Full-Stack (Angular + Python + SQLite)

Este projeto preserva o editor Angular existente e o integra a uma API real. A pesquisa inicial trata de **Inteligência Artificial e Segurança Digital**, com 14 perguntas editáveis.

## Pré-requisitos
- Node.js e npm compatíveis com Angular 22 (consulte a matriz oficial da versão instalada)
- Python 3.10 ou superior

## Executar localmente

Abra **dois terminais** na raiz do repositório.

Terminal 1 (Windows PowerShell):
```powershell
$env:FORMS_ADMIN_TOKEN = "coloque-aqui-uma-chave-segura-de-mais-de-16-caracteres"
python backend/server.py
```

Terminal 2:
```powershell
npm ci
npm start
```

Acesse http://localhost:4200 . Para abrir o editor, clique em **Editor** e informe o token configurado no terminal 1.

**Importante:** O token administrativo não é salvo no código: somente na variável de ambiente do backend e, após login, temporariamente na sessão do navegador. O Angular encaminha /api ao backend local usando proxy.conf.json.

## Recursos
- Formulário com 14 perguntas e cinco tipos de resposta
- Editor de perguntas e alternativas, reordenação e duplicação
- Respostas persistidas em SQLite no servidor; validação no frontend e backend
- Autenticação por token para edição e resultados
- Tabela de resultados, exportação CSV, exclusão com confirmação
- Layout responsivo e mensagens de sucesso/erro
- Testes do backend com `cd backend; python -m unittest -v`
- Testes Angular: `npm test`; build: `npm run build`

## API
- `GET /api/health`: status
- `GET /api/form`: formulário público
- `POST /api/responses`: enviar respostas (JSON `{ "valores": { "id": "resposta" } }`)
- `GET /api/responses`: listar respostas (admin)
- `GET /api/responses.csv`: exportar CSV (admin)
- `PUT /api/form`: editar formulário (admin)
- `DELETE /api/responses`: excluir respostas (admin)

Endpoints admin exigem `Authorization: Bearer SEU_TOKEN`.

## Avisos e limitações
- A aplicação deve ser executada atrás de HTTPS e autenticação mais forte antes de uso público em produção.
- O bloqueio simples de envios repetidos por IP é proteção básica, não substitui anti-spam profissional.
- Mudanças nas perguntas não modificam respostas históricas; a exportação apresenta as perguntas atuais.
- Não colete senhas, documentos ou dados sensíveis. Defina política de privacidade, retenção e base legal antes de coletar dados reais.
- Não coloque o arquivo .sqlite3 ou o token no GitHub.

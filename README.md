# MeuForms

Criador de formulários editável feito com Angular, no estilo do Google Forms. Dá para montar as perguntas, testar o preenchimento e ver as respostas, tudo salvo no próprio navegador (localStorage).

## O que o projeto faz

- Edita título e descrição do formulário
- Cinco tipos de pergunta: resposta curta, parágrafo, múltipla escolha, caixas de seleção e lista suspensa
- Marcar pergunta como obrigatória, duplicar, excluir e reordenar
- Aba "Preencher" para responder o formulário, com validação dos campos obrigatórios
- Aba "Respostas" com tabela e exportação em CSV
- Exportar e importar a estrutura do formulário em JSON

## Como rodar

Precisa do Node.js (versão 20 ou mais nova) e do VS Code.

```bash
npm install
npm start
```

Depois abra http://localhost:4200 no navegador. No VS Code, também dá para usar o terminal integrado (Ctrl + ') e rodar os mesmos comandos.

Outros comandos:

```bash
npm test        # testes unitários
npm run build   # build de produção em dist/meu-forms
```

## Estrutura

```
src/app/app.ts     lógica do componente (estado, edição, respostas, exportação)
src/app/app.html   template das três abas
src/app/app.css    estilos
```

## Subindo para o GitHub

Crie um repositório vazio no GitHub (sem README) e rode, trocando a URL pela do seu repositório:

```bash
git remote add origin https://github.com/SEU-USUARIO/meu-forms.git
git branch -M main
git push -u origin main
```

O projeto já vem com um commit inicial feito.

import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, timingSafeEqual } from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
const dbPath = resolve(process.env.FORMS_DB ?? resolve(here, 'forms.sqlite3'));
const port = Number(process.env.FORMS_PORT ?? '8000');
const maxBytes = 150_000;
const types = new Set(['texto','paragrafo','multipla','caixas','lista']);
const recentPosts = new Map();

export function validateForm(form) {
  if (!form || typeof form !== 'object' || Array.isArray(form) ||
      typeof form.titulo !== 'string' || form.titulo.trim().length < 1 || form.titulo.length > 160)
    throw Error('Título inválido');
  if (typeof form.descricao !== 'string' || form.descricao.length > 1500)
    throw Error('Descrição inválida');
  if (!Array.isArray(form.perguntas) || form.perguntas.length < 1 || form.perguntas.length > 100)
    throw Error('O formulário deve conter entre 1 e 100 perguntas');
  const ids = new Set();
  for (const q of form.perguntas) {
    if (!q || typeof q.id !== 'string' || !q.id || q.id.length > 80 || ids.has(q.id))
      throw Error('IDs das perguntas inválidos ou duplicados');
    ids.add(q.id);
    if (typeof q.titulo !== 'string' || !q.titulo.trim() || q.titulo.length > 300)
      throw Error('Título da pergunta inválido');
    if (!types.has(q.tipo) || typeof q.obrigatoria !== 'boolean') throw Error('Tipo de pergunta inválido');
    if (!Array.isArray(q.opcoes) || q.opcoes.length > 30 ||
        q.opcoes.some(o => typeof o !== 'string' || !o.trim() || o.length > 150))
      throw Error('Opções inválidas');
    if (['multipla','caixas','lista'].includes(q.tipo) &&
        (!q.opcoes.length || new Set(q.opcoes).size !== q.opcoes.length))
      throw Error('Perguntas de seleção exigem opções sem repetição');
  }
}
export function validateAnswers(body, form) {
  if (!body || typeof body !== 'object' || !body.valores || typeof body.valores !== 'object' || Array.isArray(body.valores))
    throw Error('Respostas inválidas');
  const byId = new Map(form.perguntas.map(q => [q.id,q]));
  for (const key of Object.keys(body.valores)) if (!byId.has(key)) throw Error('Pergunta desconhecida');
  const result={};
  for (const q of form.perguntas) {
    const value = body.valores[q.id] ?? (q.tipo === 'caixas' ? [] : '');
    let empty;
    if (q.tipo === 'caixas') {
      if (!Array.isArray(value) || value.length > q.opcoes.length ||
          value.some(v => typeof v !== 'string' || !q.opcoes.includes(v)) ||
          new Set(value).size !== value.length) throw Error('Opções inválidas: '+q.id);
      empty = value.length === 0;
    } else {
      if (typeof value !== 'string' || value.length > 3000) throw Error('Resposta inválida: '+q.id);
      if (['multipla','lista'].includes(q.tipo) && value && !q.opcoes.includes(value))
        throw Error('Opção inválida: '+q.id);
      empty = !value.trim();
    }
    if (q.obrigatoria && empty) throw Error('Resposta obrigatória: '+q.id);
    result[q.id] = value;
  }
  return result;
}
export function openDb(path = dbPath) {
  if (path !== ':memory:') mkdirSync(dirname(path), {recursive:true});
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS forms (id INTEGER PRIMARY KEY CHECK (id=1), data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS responses (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, values_json TEXT NOT NULL);');
  const seed = db.prepare('SELECT data FROM forms WHERE id=1').get();
  if (!seed) db.prepare('INSERT INTO forms(id,data) VALUES(1,?)').run(readFileSync(resolve(here,'questions.json'),'utf8'));
  return db;
}
const send = (res,status,obj) => {
  const output = Buffer.from(JSON.stringify(obj));
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Length':output.length});
  res.end(output);
};
function isAdmin(req,token) {
  const supplied=req.headers.authorization;
  if (typeof supplied !== 'string' || !token || !supplied.startsWith('Bearer ')) return false;
  const value=Buffer.from(supplied.slice(7)), expected=Buffer.from(token);
  return value.length === expected.length && timingSafeEqual(value,expected);
}
async function bodyJson(req) {
  const chunks=[]; let total=0;
  for await (const chunk of req) {
    total+=chunk.length;
    if (total>maxBytes) throw Error('Corpo da requisição muito grande');
    chunks.push(chunk);
  }
  if (total===0) throw Error('Corpo vazio');
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Error('JSON inválido'); }
}
const csvCell = value => '"'+String(value ?? '').replaceAll('"','""')+'"';
export function createApp({ db, token }) {
  return createServer(async (req,res) => {
    const path=new URL(req.url ?? '/', 'http://localhost').pathname;
    if (!path.startsWith('/api/')) return send(res,404,{error:'Rota não encontrada'});
    const adminPaths= new Set(['PUT /api/form','GET /api/responses','GET /api/responses.csv','DELETE /api/responses']);
    const methodPath=(req.method ?? '')+' '+path;
    if (adminPaths.has(methodPath) && !isAdmin(req,token)) return send(res,401,{error:'Acesso administrativo negado'});
    try {
      if (methodPath==='GET /api/health') return send(res,200,{status:'ok'});
      const form=()=>JSON.parse(db.prepare('SELECT data FROM forms WHERE id=1').get().data);
      if (methodPath==='GET /api/form') return send(res,200,form());
      if (methodPath==='PUT /api/form') {
        const payload=await bodyJson(req); validateForm(payload);
        db.prepare('UPDATE forms SET data=? WHERE id=1').run(JSON.stringify(payload));
        return send(res,200,{message:'Formulário salvo'});
      }
      if (methodPath==='POST /api/responses') {
        const addr=req.socket.remoteAddress ?? 'unknown', now=Date.now();
        if (now-(recentPosts.get(addr) ?? 0)<2000) return send(res,429,{error:'Aguarde antes de enviar novamente'});
        const values=validateAnswers(await bodyJson(req),form());
        recentPosts.set(addr,now);
        if (recentPosts.size>5000) recentPosts.clear();
        const info=db.prepare('INSERT INTO responses(date,values_json) VALUES(?,?)').run(new Date().toISOString(),JSON.stringify(values));
        return send(res,201,{id:Number(info.lastInsertRowid),message:'Resposta salva'});
      }
      if (methodPath==='GET /api/responses' || methodPath==='GET /api/responses.csv') {
        const respostas=db.prepare('SELECT id,date,values_json FROM responses ORDER BY id DESC').all()
          .map(row=>({id:row.id,data:row.date,valores:JSON.parse(row.values_json)}));
        if (path==='/api/responses') return send(res,200,{respostas});
        const perguntas=form().perguntas;
        const rows=[['Data',...perguntas.map(q=>q.titulo)], ...respostas.map(r=>[r.data,...perguntas.map(q=>{
          const value=r.valores[q.id] ?? ''; return Array.isArray(value)?value.join(', '):value;
        })])];
        const csv=Buffer.from('\ufeff'+rows.map(row=>row.map(csvCell).join(';')).join('\r\n'),'utf8');
        res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="respostas.csv"','Content-Length':csv.length,'X-Content-Type-Options':'nosniff'});
        return res.end(csv);
      }
      if (methodPath==='DELETE /api/responses') {
        db.prepare('DELETE FROM responses').run();
        return send(res,200,{message:'Respostas removidas'});
      }
      return send(res,404,{error:'Rota não encontrada'});
    } catch(e) {
      return send(res,400,{error:e instanceof Error?e.message:'Requisição inválida'});
    }
  });
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const token=process.env.FORMS_ADMIN_TOKEN ?? '';
  if (token.length<16) {
    console.error('Configure FORMS_ADMIN_TOKEN com pelo menos 16 caracteres.');
    process.exit(1);
  }
  const db=openDb();
  createApp({db,token}).listen(port,'127.0.0.1',()=>{
    console.log('API MeuForms em http://127.0.0.1:'+port);
  });
}

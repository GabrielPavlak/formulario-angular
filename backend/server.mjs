import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { timingSafeEqual } from 'node:crypto';

// SISTEMA DE DEMONSTRACAO. NAO REALIZA TRANSACOES FINANCEIRAS REAIS.
const HERE=dirname(fileURLToPath(import.meta.url));
const DB_PATH=resolve(process.env.FORMS_DB ?? resolve(HERE,'forms.sqlite3'));
const PORT=Number(process.env.FORMS_PORT ?? '8000');
const METHODS=['PIX simulado','Transferência simulada','Boleto simulado','Cartão de débito simulado','Dinheiro fictício'];
const KINDS=['entrada','saida'];
class HttpError extends Error { constructor(status,message){super(message);this.status=status;} }
function fail(message,status=400){throw new HttpError(status,message);}
function validDate(v){
  if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;
  const d=new Date(v+'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0,10)===v;
}
const now=()=>new Date().toISOString();
export function validateAccount(v){
  if(!v||typeof v!=='object'||typeof v.holder!=='string'||v.holder.trim().length<3||v.holder.trim().length>100)
    fail('Informe uma identificação fictícia com 3 a 100 caracteres.');
  return {holder:v.holder.trim()};
}
export function validateEntry(v){
  if(!v||typeof v!=='object'||Array.isArray(v))fail('Movimentação inválida.');
  if(!Number.isSafeInteger(v.accountId)||v.accountId<1)fail('Conta inválida.');
  if(!KINDS.includes(v.kind))fail('Tipo de movimentação inválido.');
  if(!Number.isSafeInteger(v.amountCents)||v.amountCents<1||v.amountCents>999999999)
    fail('Valor deve ser positivo, em centavos inteiros.');
  if(!validDate(v.occurredOn))fail('Data inválida. Use AAAA-MM-DD.');
  if(!METHODS.includes(v.method))fail('Forma de pagamento inválida.');
  if(typeof v.description!=='string'||v.description.trim().length<3||v.description.trim().length>180)
    fail('Descrição precisa ter 3 a 180 caracteres.');
  if(v.reference!==undefined&&(typeof v.reference!=='string'||v.reference.length>80))fail('Referência inválida.');
  return {accountId:v.accountId,kind:v.kind,amountCents:v.amountCents,occurredOn:v.occurredOn,
    method:v.method,description:v.description.trim(),reference:(v.reference??'').trim()};
}
function insertAccount(db,holder){
  const createdAt=now();
  const result=db.prepare("INSERT INTO bank_accounts(holder,code,created_at) VALUES (?,lower(hex(randomblob(16))),?)").run(holder,createdAt);
  const id=Number(result.lastInsertRowid),code='SIM-'+String(id).padStart(5,'0');
  db.prepare('UPDATE bank_accounts SET code=? WHERE id=?').run(code,id);
  return {id,holder,code,agency:'DEMO',createdAt};
}
function seed(db){
  if(db.prepare('SELECT COUNT(*) AS n FROM bank_accounts').get().n)return;
  db.exec('BEGIN IMMEDIATE');
  try{
    for(const holder of ['Conta Demonstração A','Conta Demonstração B','Conta Laboratório C'])insertAccount(db,holder);
    const samples=[
      [1,'entrada',350000,'2026-11-02','Transferência simulada','Saldo inicial de demonstração','ABERTURA-01'],
      [1,'saida',7990,'2026-11-04','Cartão de débito simulado','Compra fictícia de material','COMPRA-01'],
      [1,'entrada',124500,'2026-11-12','PIX simulado','Recebimento fictício','REC-01'],
      [1,'saida',24990,'2026-11-18','Boleto simulado','Pagamento fictício de serviço','PAG-01'],
      [1,'saida',10000,'2026-11-20','Dinheiro fictício','Saque de teste','SAQUE-01'],
      [2,'entrada',180000,'2026-11-03','Dinheiro fictício','Depósito de demonstração','ABERTURA-02'],
      [2,'saida',32000,'2026-11-10','PIX simulado','Pagamento simulado','PAG-02'],
      [2,'entrada',50000,'2026-11-16','Transferência simulada','Crédito simulado','CRED-02'],
      [3,'entrada',92000,'2026-11-06','Transferência simulada','Saldo inicial fictício','ABERTURA-03'],
      [3,'saida',14500,'2026-11-21','Boleto simulado','Conta de demonstração','PAG-03']
    ];
    const sql='INSERT INTO bank_entries(account_id,kind,amount_cents,occurred_on,method,description,reference,created_at) VALUES (?,?,?,?,?,?,?,?)';
    const stmt=db.prepare(sql);
    for(const row of samples)stmt.run(...row,now());
    db.exec('COMMIT');
  }catch(err){db.exec('ROLLBACK');throw err;}
}
export function openDb(path=DB_PATH,withSeed=true){
  if(path!==':memory:')mkdirSync(dirname(path),{recursive:true});
  const db=new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;'
   +'CREATE TABLE IF NOT EXISTS bank_accounts (id INTEGER PRIMARY KEY AUTOINCREMENT,holder TEXT NOT NULL,code TEXT NOT NULL UNIQUE,created_at TEXT NOT NULL);'
   +"CREATE TABLE IF NOT EXISTS bank_entries (id INTEGER PRIMARY KEY AUTOINCREMENT,account_id INTEGER NOT NULL REFERENCES bank_accounts(id),kind TEXT NOT NULL CHECK(kind IN ('entrada','saida')),amount_cents INTEGER NOT NULL CHECK(amount_cents>0),occurred_on TEXT NOT NULL,method TEXT NOT NULL,description TEXT NOT NULL,reference TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL);"
   +'CREATE INDEX IF NOT EXISTS idx_bank_entries_account_date ON bank_entries(account_id,occurred_on,id);');
  if(withSeed)seed(db);
  return db;
}
export function accounts(db){
  return db.prepare("SELECT a.id,a.holder,a.code,a.created_at AS createdAt,'DEMO' AS agency, COUNT(e.id) AS entriesCount,"
  +"COALESCE(SUM(CASE WHEN e.kind='entrada' THEN e.amount_cents ELSE -e.amount_cents END),0) AS balanceCents"
  +' FROM bank_accounts a LEFT JOIN bank_entries e ON a.id=e.account_id GROUP BY a.id ORDER BY a.id').all();
}
const accountExists=(db,id)=>!!db.prepare('SELECT 1 FROM bank_accounts WHERE id=?').get(id);
export function createEntry(db,input){
  const v=validateEntry(input);
  db.exec('BEGIN IMMEDIATE');
  try{
    if(!accountExists(db,v.accountId))fail('Conta fictícia não encontrada.',404);
    const inserted=db.prepare('INSERT INTO bank_entries(account_id,kind,amount_cents,occurred_on,method,description,reference,created_at) VALUES (?,?,?,?,?,?,?,?)')
     .run(v.accountId,v.kind,v.amountCents,v.occurredOn,v.method,v.description,v.reference,now());
    const rows=db.prepare('SELECT kind,amount_cents FROM bank_entries WHERE account_id=? ORDER BY occurred_on,id').all(v.accountId);
    let saldo=0;
    for(const row of rows){
      saldo+=row.kind==='entrada'?row.amount_cents:-row.amount_cents;
      if(saldo<0)fail('Saldo insuficiente na data informada. Movimento não registrado.',422);
    }
    db.exec('COMMIT');
    return {id:Number(inserted.lastInsertRowid),balanceCents:saldo};
  }catch(err){db.exec('ROLLBACK');throw err;}
}
export function statement(db,params){
  const id=Number(params.get('accountId'));
  if(!Number.isSafeInteger(id)||id<1)fail('Selecione uma conta.');
  if(!accountExists(db,id))fail('Conta não encontrada.',404);
  const from=params.get('from')??'',to=params.get('to')??'';
  const kind=params.get('kind')??'',method=params.get('method')??'';
  if(from&&!validDate(from)||to&&!validDate(to)||from&&to&&from>to)fail('Período inválido.');
  if(kind&&!KINDS.includes(kind))fail('Filtro de tipo inválido.');
  if(method&&!METHODS.includes(method))fail('Filtro de pagamento inválido.');
  const data=db.prepare('SELECT id,account_id AS accountId,kind,amount_cents AS amountCents,occurred_on AS occurredOn,method,description,reference,created_at AS createdAt FROM bank_entries WHERE account_id=? ORDER BY occurred_on,id').all(id);
  let balance=0;
  const all=data.map(e=>{balance+=e.kind==='entrada'?e.amountCents:-e.amountCents;return {...e,balanceAfterCents:balance};});
  const entries=all.filter(e=>(!from||e.occurredOn>=from)&&(!to||e.occurredOn<=to)
   &&(!kind||e.kind===kind)&&(!method||e.method===method)).reverse();
  return {entries,summary:{accountId:id,balanceCents:balance,
    incomeCents:entries.filter(e=>e.kind==='entrada').reduce((s,e)=>s+e.amountCents,0),
    expenseCents:entries.filter(e=>e.kind==='saida').reduce((s,e)=>s+e.amountCents,0),count:entries.length}};
}
function respond(res,status,data){
  const body=Buffer.from(JSON.stringify(data));
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff','Content-Length':body.length});res.end(body);
}
function authorized(req,token){
  const header=req.headers.authorization??'';
  if(typeof header!=='string'||!header.startsWith('Bearer ')||!token)return false;
  const provided=Buffer.from(header.slice(7)),expected=Buffer.from(token);
  return provided.length===expected.length&&timingSafeEqual(provided,expected);
}
async function readJson(req){
  let size=0;const chunks=[];
  for await(const chunk of req){size+=chunk.length;if(size>32000)fail('Requisição muito grande.',413);chunks.push(chunk);}
  if(!size)fail('Corpo vazio.');
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{fail('JSON inválido.');}
}
function csvCell(v){
  let s=String(v??'');
  if(/^\s*[=+\-@]/.test(s))s="'"+s;
  return '"'+s.replaceAll('"','""')+'"';
}
export function createApp({db,token}){
  return createServer(async(req,res)=>{
    try{
      const url=new URL(req.url??'/','http://127.0.0.1');
      const path=url.pathname,method=req.method;
      if(path==='/api/health'&&method==='GET')return respond(res,200,{status:'ok',mode:'simulacao'});
      if(!path.startsWith('/api/bank/'))return respond(res,404,{error:'Rota não encontrada.'});
      if(!authorized(req,token))return respond(res,401,{error:'Token administrativo inválido.'});
      if(path==='/api/bank/accounts'&&method==='GET')return respond(res,200,{accounts:accounts(db)});
      if(path==='/api/bank/accounts'&&method==='POST'){
        const {holder}=validateAccount(await readJson(req));
        return respond(res,201,{account:insertAccount(db,holder)});
      }
      if(path==='/api/bank/entries'&&method==='GET')return respond(res,200,statement(db,url.searchParams));
      if(path==='/api/bank/entries'&&method==='POST')
        return respond(res,201,{message:'Movimentação fictícia registrada.',...createEntry(db,await readJson(req))});
      if(path==='/api/bank/statement.csv'&&method==='GET'){
        const data=statement(db,url.searchParams);
        const header=['ID','Data','Tipo','Descrição','Forma de pagamento','Referência','Valor (R$)','Saldo após (R$)'];
        const money=cents=>(cents/100).toFixed(2).replace('.',',');
        const rows=[header,...data.entries.map(e=>[e.id,e.occurredOn,e.kind,e.description,e.method,e.reference,
          (e.kind==='entrada'?'+':'-')+money(e.amountCents),money(e.balanceAfterCents)])];
        const csv=Buffer.from('\ufeff'+rows.map(r=>r.map(csvCell).join(';')).join('\r\n'));
        res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8',
          'Content-Disposition':'attachment; filename="extrato-banco-ficticio.csv"',
          'Content-Length':csv.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
        return res.end(csv);
      }
      return respond(res,404,{error:'Rota não encontrada.'});
    }catch(err){
      const status=err instanceof HttpError?err.status:500;
      if(status===500)console.error('Falha interna:',err);
      return respond(res,status,{error:status===500?'Falha interna do servidor.':err.message});
    }
  });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const token=process.env.FORMS_ADMIN_TOKEN??'';
  if(token.length<16){console.error('Configure FORMS_ADMIN_TOKEN com pelo menos 16 caracteres.');process.exit(1);}
  const db=openDb();
  createApp({db,token}).listen(PORT,'127.0.0.1',()=>console.log('Banco Escola (simulação) em http://127.0.0.1:'+PORT));
}

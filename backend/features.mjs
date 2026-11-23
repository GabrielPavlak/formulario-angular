import { checkTransferLimits } from './experience.mjs';
// Módulos avançados do Banco Escola. NÃO conecta instituições financeiras.
// Usa o mesmo banco SQLite e razão de lançamentos do simulador original.
import { randomUUID } from 'node:crypto';
const methods=['PIX simulado','Transferência simulada'];
export const categories=['Alimentação','Casa','Educação','Lazer','Saúde','Transporte','Compras','Serviços','Salário','Transferências','Reserva','Outros'];
class FError extends Error { constructor(message,status=400){super(message);this.status=status;} }
function ensure(value,message,status=400){if(!value)throw new FError(message,status);}
const day=()=>new Date().toISOString().slice(0,10);
const stamp=()=>new Date().toISOString();
const isoDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(new Date(s+'T00:00:00Z').getTime())&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
const monthValid=s=>typeof s==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(s);
function id(v){const n=Number(v);ensure(Number.isSafeInteger(n)&&n>0,'Identificador inválido.');return n;}
function amount(v){ensure(Number.isSafeInteger(v)&&v>0&&v<=999999999,'Informe um valor válido em centavos.');return v;}
function str(v,label,max=160,min=2){ensure(typeof v==='string'&&v.trim().length>=min&&v.trim().length<=max,label+' inválido.');return v.trim();}
function account(db,id){const a=db.prepare('SELECT id,holder,code FROM bank_accounts WHERE id=?').get(id);ensure(a,'Conta fictícia não encontrada.',404);return a;}
function money(db,id){return db.prepare("SELECT COALESCE(SUM(CASE WHEN kind='entrada' THEN amount_cents ELSE -amount_cents END),0) AS balance FROM bank_entries WHERE account_id=?").get(id).balance;}
function safeTimeline(db,accountId){
 const rows=db.prepare('SELECT kind,amount_cents FROM bank_entries WHERE account_id=? ORDER BY occurred_on,id').all(accountId);
 let balance=0;
 for(const row of rows){balance+=row.kind==='entrada'?row.amount_cents:-row.amount_cents;ensure(balance>=0,'Saldo insuficiente para essa operação.',422);}
}
function tx(db,callback){
 db.exec('BEGIN IMMEDIATE');
 try{const out=callback();db.exec('COMMIT');return out;}
 catch(e){db.exec('ROLLBACK');throw e;}
}
function journal(db,{accountId,kind,amountCents,method,description,reference='',category='Outros',transactionId=''}) {
 const result=db.prepare('INSERT INTO bank_entries (account_id,kind,amount_cents,occurred_on,method,description,reference,created_at) VALUES (?,?,?,?,?,?,?,?)')
 .run(accountId,kind,amountCents,day(),method,description,reference,stamp());
 const entryId=Number(result.lastInsertRowid);
 db.prepare('INSERT INTO bank_entry_categories(entry_id,category,transaction_id) VALUES(?,?,?)').run(entryId,category,transactionId);
 return entryId;
}
function audit(db,accountId,action,detail){
 db.prepare('INSERT INTO bank_audit(account_id,action,detail,created_at) VALUES(?,?,?,?)')
 .run(accountId,action,detail,stamp());
}
function debit(db,accountId,amountCents,method,description,category='Outros',reference='',transactionId=''){
 ensure(money(db,accountId)>=amountCents,'Saldo insuficiente na conta fictícia.',422);
 const entryId=journal(db,{accountId,kind:'saida',amountCents,method,description,category,reference,transactionId});
 safeTimeline(db,accountId);
 return entryId;
}
function credit(db,accountId,amountCents,method,description,category='Outros',reference='',transactionId=''){
 const entryId=journal(db,{accountId,kind:'entrada',amountCents,method,description,category,reference,transactionId});
 safeTimeline(db,accountId);
 return entryId;
}
function cardSeed(db,accountId){
 db.prepare("INSERT OR IGNORE INTO bank_cards(account_id,display_code,status,created_at) VALUES(?,?,'ativo',?)")
 .run(accountId,'DEMO •••• '+String(accountId).padStart(4,'0'),stamp());
}
export function installExtras(db){
 db.exec("CREATE TABLE IF NOT EXISTS bank_entry_categories (entry_id INTEGER PRIMARY KEY REFERENCES bank_entries(id), category TEXT NOT NULL DEFAULT 'Outros',transaction_id TEXT NOT NULL DEFAULT '');"
 +"CREATE TABLE IF NOT EXISTS bank_transfers (id INTEGER PRIMARY KEY,request_key TEXT UNIQUE NOT NULL,from_account_id INTEGER NOT NULL,to_account_id INTEGER NOT NULL,amount_cents INTEGER NOT NULL,method TEXT NOT NULL,description TEXT NOT NULL,out_entry_id INTEGER NOT NULL,in_entry_id INTEGER NOT NULL,created_at TEXT NOT NULL);"
 +"CREATE TABLE IF NOT EXISTS bank_goals (id INTEGER PRIMARY KEY,account_id INTEGER NOT NULL REFERENCES bank_accounts(id),name TEXT NOT NULL,target_cents INTEGER NOT NULL,balance_cents INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL);"
 +"CREATE TABLE IF NOT EXISTS bank_goal_events (id INTEGER PRIMARY KEY,goal_id INTEGER NOT NULL REFERENCES bank_goals(id),action TEXT NOT NULL,amount_cents INTEGER NOT NULL,entry_id INTEGER NOT NULL,created_at TEXT NOT NULL);"
 +"CREATE TABLE IF NOT EXISTS bank_cards (id INTEGER PRIMARY KEY,account_id INTEGER NOT NULL UNIQUE REFERENCES bank_accounts(id),display_code TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL);"
 +"CREATE TABLE IF NOT EXISTS bank_schedules (id INTEGER PRIMARY KEY,account_id INTEGER NOT NULL REFERENCES bank_accounts(id),to_account_id INTEGER REFERENCES bank_accounts(id),kind TEXT NOT NULL,amount_cents INTEGER NOT NULL,due_on TEXT NOT NULL,description TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL,executed_at TEXT NOT NULL DEFAULT '',error TEXT NOT NULL DEFAULT '');"
 +"CREATE TABLE IF NOT EXISTS bank_bills (id INTEGER PRIMARY KEY,account_id INTEGER NOT NULL REFERENCES bank_accounts(id),payee TEXT NOT NULL,reference TEXT NOT NULL,amount_cents INTEGER NOT NULL,due_on TEXT NOT NULL,entry_id INTEGER NOT NULL,created_at TEXT NOT NULL);"
 +"CREATE TABLE IF NOT EXISTS bank_budgets (account_id INTEGER NOT NULL REFERENCES bank_accounts(id),category TEXT NOT NULL,month TEXT NOT NULL,limit_cents INTEGER NOT NULL,PRIMARY KEY(account_id,category,month));"
 +"CREATE TABLE IF NOT EXISTS bank_audit (id INTEGER PRIMARY KEY,account_id INTEGER,action TEXT NOT NULL,detail TEXT NOT NULL,created_at TEXT NOT NULL);");
 for(const row of db.prepare('SELECT id FROM bank_accounts').all())cardSeed(db,row.id);
}
export function addAccountExtras(db,accountId){cardSeed(db,accountId);audit(db,accountId,'CONTA_CRIADA','Conta de demonstração criada.');}
export function addEntryExtras(db,entryId,accountId,category){
 ensure(categories.includes(category),'Categoria inválida.');
 db.prepare('INSERT INTO bank_entry_categories(entry_id,category) VALUES (?,?)').run(entryId,category);
 audit(db,accountId,'LANCAMENTO','Movimentação manual registrada.');
}
export function checkCard(db,accountId,method,kind){
 if(method!=='Cartão de débito simulado'||kind!=='saida')return;
 cardSeed(db,accountId);
 const row=db.prepare('SELECT status FROM bank_cards WHERE account_id=?').get(accountId);
 ensure(row.status==='ativo','Cartão fictício bloqueado. Desbloqueie na aba Cartões.',422);
}
function transfer(db,payload) {
 const fromAccountId=id(payload.fromAccountId),toAccountId=id(payload.toAccountId),cents=amount(payload.amountCents);
 ensure(fromAccountId!==toAccountId,'Selecione contas diferentes.');
 const method=payload.method;
 ensure(methods.includes(method),'Método de transferência inválido.');
 const description=str(payload.description,'Descrição',160,3);
 const requestKey=str(payload.requestKey,'Identificador único',100,8);
 return tx(db,()=>{
   const prior=db.prepare('SELECT * FROM bank_transfers WHERE request_key=?').get(requestKey);
   if(prior){
     ensure(prior.from_account_id===fromAccountId&&prior.to_account_id===toAccountId&&prior.amount_cents===cents
       &&prior.method===method&&prior.description===description,'Identificador de operação já utilizado para outra transferência.',409);
     return {id:prior.id,duplicated:true,fromBalanceCents:money(db,fromAccountId),toBalanceCents:money(db,toAccountId)};
   }
   const from=account(db,fromAccountId),to=account(db,toAccountId);
   checkTransferLimits(db,from.id,cents);
   const out=debit(db,from.id,cents,method,'Para '+to.holder+': '+description,'Transferências',requestKey,requestKey);
   const into=credit(db,to.id,cents,method,'De '+from.holder+': '+description,'Transferências',requestKey,requestKey);
   const result=db.prepare('INSERT INTO bank_transfers(request_key,from_account_id,to_account_id,amount_cents,method,description,out_entry_id,in_entry_id,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
   .run(requestKey,from.id,to.id,cents,method,description,out,into,stamp());
   audit(db,from.id,'TRANSFERENCIA_ENVIADA','Operação fictícia para '+to.code+'.');
   audit(db,to.id,'TRANSFERENCIA_RECEBIDA','Operação fictícia de '+from.code+'.');
   return {id:Number(result.lastInsertRowid),duplicated:false,fromBalanceCents:money(db,from.id),toBalanceCents:money(db,to.id)};
 });
}
function listGoals(db,accountId){account(db,accountId);return db.prepare('SELECT id,account_id AS accountId,name,target_cents AS targetCents,balance_cents AS balanceCents,created_at AS createdAt FROM bank_goals WHERE account_id=? ORDER BY id DESC').all(accountId);}
function moveGoal(db,goalId,action,amountCents){
 ensure(['guardar','resgatar'].includes(action),'Operação de reserva inválida.');
 amount(amountCents);
 return tx(db,()=>{
   const goal=db.prepare('SELECT * FROM bank_goals WHERE id=?').get(goalId);
   ensure(goal,'Meta não encontrada.',404);
   let entryId;
   if(action==='guardar'){
     entryId=debit(db,goal.account_id,amountCents,'Transferência simulada','Guardar em '+goal.name,'Reserva','META-'+goal.id);
     db.prepare('UPDATE bank_goals SET balance_cents=balance_cents+? WHERE id=?').run(amountCents,goal.id);
   }else{
     ensure(goal.balance_cents>=amountCents,'Saldo insuficiente na meta.',422);
     entryId=credit(db,goal.account_id,amountCents,'Transferência simulada','Resgate de '+goal.name,'Reserva','META-'+goal.id);
     db.prepare('UPDATE bank_goals SET balance_cents=balance_cents-? WHERE id=?').run(amountCents,goal.id);
   }
   db.prepare('INSERT INTO bank_goal_events(goal_id,action,amount_cents,entry_id,created_at) VALUES(?,?,?,?,?)').run(goalId,action,amountCents,entryId,stamp());
   audit(db,goal.account_id,'META_'+action.toUpperCase(),goal.name);
   return {accountBalanceCents:money(db,goal.account_id),goalBalanceCents:goal.balance_cents+(action==='guardar'?amountCents:-amountCents)};
 });
}
function scheduledExecute(db,scheduleId){
 return tx(db,()=>{
  const s=db.prepare('SELECT * FROM bank_schedules WHERE id=?').get(scheduleId);
  ensure(s,'Agendamento não encontrado.',404);
  ensure(s.status==='pendente','Agendamento não está pendente.',409);
  ensure(s.due_on<=day(),'Ainda não chegou a data prevista.',422);
  if(s.kind==='pix'){
    const a=account(db,s.account_id),b=account(db,s.to_account_id);
    debit(db,a.id,s.amount_cents,'PIX simulado','Pix agendado para '+b.holder+': '+s.description,'Transferências','AGENDA-'+s.id);
    credit(db,b.id,s.amount_cents,'PIX simulado','Pix agendado de '+a.holder+': '+s.description,'Transferências','AGENDA-'+s.id);
    audit(db,b.id,'AGENDA_RECEBIDA','Pix fictício agendado recebido.');
  }else{
    debit(db,s.account_id,s.amount_cents,'Boleto simulado','Pagamento agendado: '+s.description,'Serviços','AGENDA-'+s.id);
  }
  db.prepare("UPDATE bank_schedules SET status='executado',executed_at=?,error='' WHERE id=?").run(stamp(),scheduleId);
  audit(db,s.account_id,'AGENDA_EXECUTADA','Agendamento #'+scheduleId+' executado manualmente.');
  return {executed:true,balanceCents:money(db,s.account_id)};
 });
}
function analytics(db,accountId,month){
 account(db,accountId);ensure(monthValid(month),'Mês inválido. Use AAAA-MM.');
 const entries=db.prepare("SELECT e.kind,e.amount_cents AS cents,COALESCE(t.category,'Outros') AS category FROM bank_entries e LEFT JOIN bank_entry_categories t ON t.entry_id=e.id WHERE e.account_id=? AND substr(e.occurred_on,1,7)=?").all(accountId,month);
 const incomeCents=entries.filter(e=>e.kind==='entrada').reduce((sum,e)=>sum+e.cents,0);
 const expenseCents=entries.filter(e=>e.kind==='saida'&&e.category!=='Reserva').reduce((sum,e)=>sum+e.cents,0);
 const byCategory={};
 for(const e of entries)if(e.kind==='saida'&&e.category!=='Reserva')byCategory[e.category]=(byCategory[e.category]??0)+e.cents;
 const budgets=db.prepare('SELECT category,limit_cents AS limitCents FROM bank_budgets WHERE account_id=? AND month=?').all(accountId,month);
 const history=db.prepare("SELECT substr(occurred_on,1,7) AS month, SUM(CASE WHEN kind='entrada' THEN amount_cents ELSE 0 END) AS incomeCents, SUM(CASE WHEN kind='saida' THEN amount_cents ELSE 0 END) AS expenseCents FROM bank_entries WHERE account_id=? GROUP BY substr(occurred_on,1,7) ORDER BY month DESC LIMIT 6").all(accountId).reverse();
 return {month,incomeCents,expenseCents,byCategory,budgets,history};
}
const reply=(res,status,data)=>{const b=Buffer.from(JSON.stringify(data));res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Length':b.length});res.end(b);};
async function body(req){
 let size=0;const chunks=[];
 for await(const chunk of req){size+=chunk.length;ensure(size<=40000,'Requisição muito grande.',413);chunks.push(chunk);}
 ensure(size,'Corpo vazio.');
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
 catch{throw new FError('JSON inválido.');}
}
export async function handleExtra(db,req,res,path,url){
 // Rotas não reconhecidas são tratadas pela API principal.
 const route=path.replace(/^\/api\/bank/,'');
 const method=req.method;
 const routes=['/transfer','/cards','/goals','/schedules','/bills','/analytics','/budgets','/activity','/overview','/receipts'];
 if(!routes.some(p=>route===p||route.startsWith(p+'/')))return false;
 try{
  const queryAccount=()=>id(url.searchParams.get('accountId'));
  if(route==='/transfer'&&method==='POST')return reply(res,201,transfer(db,await body(req))),true;
  if(route.match(/^\/transfer\/\d+\/receipt$/)&&method==='GET'){
    const row=db.prepare('SELECT t.*, a.holder AS fromHolder,b.holder AS toHolder,a.code AS fromCode,b.code AS toCode FROM bank_transfers t JOIN bank_accounts a ON a.id=t.from_account_id JOIN bank_accounts b ON b.id=t.to_account_id WHERE t.id=?').get(id(route.split('/')[2]));
    ensure(row,'Comprovante não encontrado.',404);return reply(res,200,{receipt:{...row,disclaimer:'SIMULAÇÃO — NÃO É COMPROVANTE BANCÁRIO REAL'}}),true;
  }
  if(route==='/cards'&&method==='GET'){
    const accountId=queryAccount();account(db,accountId);cardSeed(db,accountId);
    return reply(res,200,{cards:db.prepare('SELECT id,account_id AS accountId,display_code AS displayCode,status,created_at AS createdAt FROM bank_cards WHERE account_id=?').all(accountId)}),true;
  }
  if(route.match(/^\/cards\/\d+\/toggle$/)&&method==='POST'){
    const cardId=id(route.split('/')[2]);
    const card=db.prepare('SELECT * FROM bank_cards WHERE id=?').get(cardId);ensure(card,'Cartão não encontrado.',404);
    const status=card.status==='ativo'?'bloqueado':'ativo';
    db.prepare('UPDATE bank_cards SET status=? WHERE id=?').run(status,cardId);
    audit(db,card.account_id,'CARTAO_'+status.toUpperCase(),'Cartão fictício '+status+'.');
    return reply(res,200,{cardId,status}),true;
  }
  if(route==='/goals'&&method==='GET')return reply(res,200,{goals:listGoals(db,queryAccount())}),true;
  if(route==='/goals'&&method==='POST'){
    const p=await body(req),accountId=id(p.accountId);account(db,accountId);
    const name=str(p.name,'Nome da meta',70,3),targetCents=amount(p.targetCents);
    const r=db.prepare('INSERT INTO bank_goals(account_id,name,target_cents,balance_cents,created_at) VALUES (?,?,?,0,?)').run(accountId,name,targetCents,stamp());
    audit(db,accountId,'META_CRIADA',name);
    return reply(res,201,{goalId:Number(r.lastInsertRowid)}),true;
  }
  if(route.match(/^\/goals\/\d+\/move$/)&&method==='POST'){
    const p=await body(req);return reply(res,200,moveGoal(db,id(route.split('/')[2]),p.action,p.amountCents)),true;
  }
  if(route==='/schedules'&&method==='GET'){
    const accountId=queryAccount();account(db,accountId);
    const schedules=db.prepare('SELECT id,account_id AS accountId,to_account_id AS toAccountId,kind,amount_cents AS amountCents,due_on AS dueOn,description,status,created_at AS createdAt,executed_at AS executedAt FROM bank_schedules WHERE account_id=? ORDER BY due_on,id').all(accountId);
    return reply(res,200,{schedules}),true;
  }
  if(route==='/schedules'&&method==='POST'){
    const p=await body(req),accountId=id(p.accountId);account(db,accountId);
    ensure(['pix','boleto'].includes(p.kind),'Tipo de agendamento inválido.');
    amount(p.amountCents);ensure(isoDate(p.dueOn)&&p.dueOn>=day(),'Escolha uma data futura ou atual.');
    const description=str(p.description,'Descrição',160,3);
    let dest=null;
    if(p.kind==='pix'){dest=id(p.toAccountId);account(db,dest);ensure(dest!==accountId,'Contas devem ser diferentes.');}
    const r=db.prepare("INSERT INTO bank_schedules(account_id,to_account_id,kind,amount_cents,due_on,description,status,created_at) VALUES(?,?,?,?,?,?,'pendente',?)")
      .run(accountId,dest,p.kind,p.amountCents,p.dueOn,description,stamp());
    audit(db,accountId,'AGENDA_CRIADA','Agendamento fictício para '+p.dueOn+'.');
    return reply(res,201,{scheduleId:Number(r.lastInsertRowid),status:'pendente'}),true;
  }
  if(route.match(/^\/schedules\/\d+\/execute$/)&&method==='POST')return reply(res,200,scheduledExecute(db,id(route.split('/')[2]))),true;
  if(route.match(/^\/schedules\/\d+\/cancel$/)&&method==='POST'){
    const scheduleId=id(route.split('/')[2]),row=db.prepare('SELECT * FROM bank_schedules WHERE id=?').get(scheduleId);
    ensure(row,'Agendamento não encontrado.',404);ensure(row.status==='pendente','Agendamento não está pendente.',409);
    db.prepare("UPDATE bank_schedules SET status='cancelado' WHERE id=?").run(scheduleId);
    audit(db,row.account_id,'AGENDA_CANCELADA','Agendamento #'+scheduleId+' cancelado.');
    return reply(res,200,{scheduleId,status:'cancelado'}),true;
  }
  if(route==='/bills'&&method==='POST'){
    const p=await body(req),accountId=id(p.accountId);account(db,accountId);
    const payee=str(p.payee,'Favorecido fictício',100,3);
    const reference=str(p.reference,'Referência simulada',80,3);
    const dueOn=p.dueOn;ensure(isoDate(dueOn),'Data de vencimento inválida.');
    const cents=amount(p.amountCents);
    const result=tx(db,()=>{
      const entryId=debit(db,accountId,cents,'Boleto simulado','Pagamento fictício: '+payee,'Serviços',reference);
      const r=db.prepare('INSERT INTO bank_bills(account_id,payee,reference,amount_cents,due_on,entry_id,created_at) VALUES (?,?,?,?,?,?,?)')
        .run(accountId,payee,reference,cents,dueOn,entryId,stamp());
      audit(db,accountId,'BOLETO_SIMULADO','Pagamento fictício para '+payee+'.');
      return {billId:Number(r.lastInsertRowid),entryId,balanceCents:money(db,accountId)};
    });
    return reply(res,201,result),true;
  }
  if(route==='/analytics'&&method==='GET'){
    const accountId=queryAccount(),month=url.searchParams.get('month')??day().slice(0,7);
    return reply(res,200,analytics(db,accountId,month)),true;
  }
  if(route==='/budgets'&&method==='PUT'){
    const p=await body(req),accountId=id(p.accountId);account(db,accountId);
    ensure(monthValid(p.month),'Mês inválido.');ensure(categories.includes(p.category)&&p.category!=='Reserva','Categoria inválida.');
    const limitCents=amount(p.limitCents);
    db.prepare('INSERT INTO bank_budgets(account_id,category,month,limit_cents) VALUES(?,?,?,?) ON CONFLICT(account_id,category,month) DO UPDATE SET limit_cents=excluded.limit_cents')
      .run(accountId,p.category,p.month,limitCents);
    audit(db,accountId,'ORCAMENTO_ALTERADO','Limite fictício de '+p.category+'.');
    return reply(res,200,{ok:true}),true;
  }
  if(route==='/activity'&&method==='GET'){
    const accountId=queryAccount();account(db,accountId);
    const items=db.prepare('SELECT id,action,detail,created_at AS createdAt FROM bank_audit WHERE account_id=? ORDER BY id DESC LIMIT 80').all(accountId);
    return reply(res,200,{items}),true;
  }
  if(route==='/overview'&&method==='GET'){
    const accountId=queryAccount();account(db,accountId);
    const goals=listGoals(db,accountId);
    const schedules=db.prepare("SELECT COUNT(*) AS n FROM bank_schedules WHERE account_id=? AND status='pendente'").get(accountId);
    const card=db.prepare('SELECT status FROM bank_cards WHERE account_id=?').get(accountId);
    const reserveCents=goals.reduce((s,g)=>s+g.balanceCents,0);
    return reply(res,200,{checkingCents:money(db,accountId),reserveCents,totalCents:money(db,accountId)+reserveCents,pendingSchedules:schedules.n,cardStatus:card?.status??'ativo'}),true;
  }
  if(route.match(/^\/receipts\/\d+$/)&&method==='GET'){
    const entryId=id(route.split('/')[2]),accountId=queryAccount();account(db,accountId);
    const entry=db.prepare('SELECT e.id,e.account_id AS accountId,e.kind,e.amount_cents AS amountCents,e.occurred_on AS occurredOn,e.method,e.description,e.reference,e.created_at AS createdAt,COALESCE(c.category,\'Outros\') AS category FROM bank_entries e LEFT JOIN bank_entry_categories c ON c.entry_id=e.id WHERE e.id=? AND e.account_id=?').get(entryId,accountId);
    ensure(entry,'Registro não encontrado.',404);
    return reply(res,200,{receipt:{...entry,disclaimer:'DEMONSTRAÇÃO — SEM VALIDADE BANCÁRIA'}}),true;
  }
  return reply(res,404,{error:'Operação não encontrada.'}),true;
 }catch(error){
  const status=error instanceof FError?error.status:500;
  if(status===500)console.error('Falha em banco avançado:',error);
  reply(res,status,{error:status===500?'Falha interna.':error.message});
  return true;
 }
}

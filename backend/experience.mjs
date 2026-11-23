/**
 * Recursos de experiência bancária (100% DEMONSTRAÇÃO).
 * Contatos favoritos e limites de operação apenas para contas fictícias.
 */
const DEFAULT_PER_TRANSFER = 1_000_000; // R$ 10.000,00 fictícios
const DEFAULT_DAILY = 2_000_000; // R$ 20.000,00 fictícios
class UserError extends Error {constructor(message,status=400){super(message);this.status=status;}}
function ensure(ok,message,status=400){if(!ok)throw new UserError(message,status);}
function id(value){const n=Number(value);ensure(Number.isSafeInteger(n)&&n>0,'Identificador inválido.');return n;}
function findAccount(db,accountId){
  const account=db.prepare('SELECT id,holder,code FROM bank_accounts WHERE id=?').get(accountId);
  ensure(account,'Conta de demonstração não encontrada.',404);
  return account;
}
function readLimit(db,accountId){
  const account=findAccount(db,accountId);
  db.prepare('INSERT OR IGNORE INTO bank_transfer_limits(account_id,max_per_transfer_cents,max_daily_cents) VALUES(?,?,?)')
    .run(account.id,DEFAULT_PER_TRANSFER,DEFAULT_DAILY);
  const row=db.prepare('SELECT max_per_transfer_cents AS maxPerTransferCents,max_daily_cents AS maxDailyCents FROM bank_transfer_limits WHERE account_id=?').get(account.id);
  const start=new Date().toISOString().slice(0,10);
  const usedCents=db.prepare('SELECT COALESCE(SUM(amount_cents),0) AS total FROM bank_transfers WHERE from_account_id=? AND substr(created_at,1,10)=?').get(account.id,start).total;
  return {...row,usedCents,remainingCents:Math.max(0,row.maxDailyCents-usedCents)};
}
export function installExperience(db){
  db.exec('CREATE TABLE IF NOT EXISTS bank_favorites (account_id INTEGER NOT NULL REFERENCES bank_accounts(id),to_account_id INTEGER NOT NULL REFERENCES bank_accounts(id),created_at TEXT NOT NULL,PRIMARY KEY(account_id,to_account_id));'
    +'CREATE TABLE IF NOT EXISTS bank_transfer_limits (account_id INTEGER PRIMARY KEY REFERENCES bank_accounts(id),max_per_transfer_cents INTEGER NOT NULL CHECK(max_per_transfer_cents>=100),max_daily_cents INTEGER NOT NULL CHECK(max_daily_cents>=100));');
  for(const row of db.prepare('SELECT id FROM bank_accounts').all())readLimit(db,row.id);
}
export function checkTransferLimits(db,accountId,amountCents){
  const limit=readLimit(db,accountId);
  ensure(amountCents<=limit.maxPerTransferCents,
    'Valor acima do limite por transferência fictícia. Ajuste em Segurança.',422);
  ensure(amountCents<=limit.remainingCents,
    'Limite diário de transferências fictícias atingido. Consulte Segurança.',422);
}
function respond(res,status,data){
  const bytes=Buffer.from(JSON.stringify(data));
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Length':bytes.length});
  res.end(bytes);
}
async function readBody(req){
  let length=0;const chunks=[];
  for await(const chunk of req){
    length+=chunk.length;ensure(length<=20_000,'Requisição muito grande.',413);
    chunks.push(chunk);
  }
  ensure(length>0,'Informe os dados solicitados.');
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
  catch{throw new UserError('JSON inválido.');}
}
export async function handleExperience(db,req,res,path,url){
  const section=path.replace(/^\/api\/bank/,'');
  if(!['/favorites','/limits'].some(p=>section===p||section.startsWith(p+'/')))return false;
  try{
    const method=req.method;
    if(section==='/favorites'&&method==='GET'){
      const accountId=id(url.searchParams.get('accountId'));findAccount(db,accountId);
      const favorites=db.prepare('SELECT a.id,a.code,a.holder,f.created_at AS createdAt FROM bank_favorites f JOIN bank_accounts a ON a.id=f.to_account_id WHERE f.account_id=? ORDER BY f.created_at DESC,a.id').all(accountId);
      respond(res,200,{favorites});return true;
    }
    if(section==='/favorites'&&method==='POST'){
      const data=await readBody(req);
      const accountId=id(data.accountId),toAccountId=id(data.toAccountId);
      findAccount(db,accountId);findAccount(db,toAccountId);
      ensure(accountId!==toAccountId,'Não é possível favoritar a própria conta.');
      const result=db.prepare('INSERT OR IGNORE INTO bank_favorites(account_id,to_account_id,created_at) VALUES(?,?,?)')
        .run(accountId,toAccountId,new Date().toISOString());
      respond(res,201,{saved:result.changes>0});return true;
    }
    if(/^\/favorites\/\d+$/.test(section)&&method==='DELETE'){
      const accountId=id(url.searchParams.get('accountId')),toAccountId=id(section.split('/')[2]);
      findAccount(db,accountId);
      const result=db.prepare('DELETE FROM bank_favorites WHERE account_id=? AND to_account_id=?').run(accountId,toAccountId);
      ensure(result.changes>0,'Favorito não encontrado.',404);
      respond(res,200,{removed:true});return true;
    }
    if(section==='/limits'&&method==='GET'){
      respond(res,200,{limits:readLimit(db,id(url.searchParams.get('accountId')))});return true;
    }
    if(section==='/limits'&&method==='PUT'){
      const data=await readBody(req),accountId=id(data.accountId);
      const per=data.maxPerTransferCents,daily=data.maxDailyCents;
      ensure(Number.isSafeInteger(per)&&per>=100&&per<=5_000_000,
        'Limite por transferência deve estar entre R$ 1,00 e R$ 50.000,00 fictícios.');
      ensure(Number.isSafeInteger(daily)&&daily>=per&&daily<=10_000_000,
        'Limite diário deve ser igual ou maior que o limite unitário e até R$ 100.000,00 fictícios.');
      readLimit(db,accountId);
      db.prepare('UPDATE bank_transfer_limits SET max_per_transfer_cents=?,max_daily_cents=? WHERE account_id=?')
        .run(per,daily,accountId);
      respond(res,200,{limits:readLimit(db,accountId)});return true;
    }
    respond(res,404,{error:'Recurso não encontrado.'});
    return true;
  }catch(error){
    const status=error instanceof UserError?error.status:500;
    if(status===500)console.error('Falha em experiência:',error);
    respond(res,status,{error:status===500?'Falha interna no módulo de experiência.':error.message});
    return true;
  }
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {openDb,createApp,createEntry,accounts} from './server.mjs';

function sample(accountId=1,kind='saida',amountCents=1300){
  return {accountId,kind,amountCents,occurredOn:new Date().toISOString().slice(0,10),
    method:'PIX simulado',description:'Teste de integridade financeira',reference:'REF-ACID-01'};
}
async function setup(t){
  const db=openDb(':memory:');
  const server=createApp({db,token:'token-de-testes-academicos-2026'});
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
  t.after(async()=>{await new Promise(ok=>server.close(ok));db.close()});
  const origin='http://127.0.0.1:'+server.address().port;
  const request=async(path,method='GET',body)=>{
    const res=await fetch(origin+path,{
      method,headers:{
        Authorization:'Bearer token-de-testes-academicos-2026',
        ...(body?{'Content-Type':'application/json'}:{})
      },...(body?{body:JSON.stringify(body)}:{})
    });
    return {status:res.status,body:await res.json()};
  };
  return {db,request};
}
test('lançamento, categoria e auditoria têm integridade atômica',t=>{
  const db=openDb(':memory:');t.after(()=>db.close());
  const beforeCount=db.prepare('SELECT COUNT(*) AS n FROM bank_entries WHERE account_id=1').get().n;
  const beforeAudit=db.prepare('SELECT COUNT(*) AS n FROM bank_audit WHERE account_id=1').get().n;
  const saved=createEntry(db,sample(1,'saida',1575),'Alimentação');
  const category=db.prepare('SELECT category FROM bank_entry_categories WHERE entry_id=?').get(saved.id);
  assert.equal(category.category,'Alimentação');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM bank_audit WHERE account_id=1').get().n,beforeAudit+1);

  db.exec("CREATE TRIGGER fail_category_insert BEFORE INSERT ON bank_entry_categories BEGIN SELECT RAISE(ABORT,'falha proposital'); END;");
  assert.throws(()=>createEntry(db,sample(1,'saida',300),'Saúde'),/falha proposital/);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM bank_entries WHERE account_id=1').get().n,beforeCount+1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM bank_audit WHERE account_id=1').get().n,beforeAudit+1);
});
test('pagamento duplicado com mesma referência não gera segundo débito',async t=>{
  const {db,request}=await setup(t);
  const body={accountId:1,payee:'Serviço fictício de energia',reference:'FATURA-DEMO-2026-11',
    dueOn:new Date().toISOString().slice(0,10),amountCents:4390};
  const before=accounts(db)[0].balanceCents;
  const first=await request('/api/bank/bills','POST',body);
  assert.equal(first.status,201);
  const again=await request('/api/bank/bills','POST',body);
  assert.equal(again.status,409);
  assert.match(again.body.error,/já foi registrado/);
  assert.equal(accounts(db)[0].balanceCents,before-4390);
  const count=db.prepare('SELECT COUNT(*) AS n FROM bank_bills WHERE account_id=1 AND reference=?').get(body.reference).n;
  assert.equal(count,1);
});
test('guardar e transferir valores não infla receita ou despesa operacional',async t=>{
  const {db,request}=await setup(t);
  const currentMonth=new Date().toISOString().slice(0,7);
  const before=(await request('/api/bank/analytics?accountId=1&month='+currentMonth)).body;
  const goal=await request('/api/bank/goals','POST',{accountId:1,name:'Reserva de teste',targetCents:20000});
  assert.equal(goal.status,201);
  assert.equal((await request('/api/bank/goals/'+goal.body.goalId+'/move','POST',
    {action:'guardar',amountCents:2000})).status,200);
  const transfer=await request('/api/bank/transfer','POST',{
    fromAccountId:1,toAccountId:2,amountCents:1200,method:'PIX simulado',
    description:'Transferência interna de teste',requestKey:'transf-analise-academica-2026'
  });
  assert.equal(transfer.status,201);
  const after=(await request('/api/bank/analytics?accountId=1&month='+currentMonth)).body;
  assert.equal(after.incomeCents,before.incomeCents);
  assert.equal(after.expenseCents,before.expenseCents);
  assert.equal(after.byCategory.Transferências,undefined);
  assert.equal(after.byCategory.Reserva,undefined);
  const historico=after.history.find(m=>m.month===currentMonth);
  assert.equal(historico.incomeCents,after.incomeCents);
  assert.equal(historico.expenseCents,after.expenseCents);
  assert.equal(db.prepare('SELECT COALESCE(SUM(balance_cents),0) AS n FROM bank_goals WHERE account_id=1').get().n,2000);
});
test('categoria inválida é rejeitada antes de persistir lançamento',async t=>{
  const {db,request}=await setup(t);
  const before=db.prepare('SELECT COUNT(*) AS n FROM bank_entries WHERE account_id=1').get().n;
  const out=await request('/api/bank/entries','POST',{...sample(1,'saida',100),
    category:'Categoria inexistente'});
  assert.equal(out.status,400);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM bank_entries WHERE account_id=1').get().n,before);
});

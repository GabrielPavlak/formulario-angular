import test from 'node:test';
import assert from 'node:assert/strict';
import {openDb,createApp,accounts,statement} from './server.mjs';

async function setup(t){
  const db=openDb(':memory:');
  const server=createApp({db,token:'token-banco-escola-demo-testes'});
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
  t.after(async()=>{await new Promise(ok=>server.close(ok));db.close()});
  const url='http://127.0.0.1:'+server.address().port;
  const auth={Authorization:'Bearer token-banco-escola-demo-testes'};
  const call=async(method,path,payload)=>{
    const res=await fetch(url+path,{method,headers:{...auth,...(payload?{'Content-Type':'application/json'}:{})},
      ...(payload?{body:JSON.stringify(payload)}:{})});
    return {status:res.status,body:await res.json()};
  };
  return {db,url,auth,call};
}
test('contas e metas: reserva e resgate conservam patrimônio',async t=>{
  const {db,call}=await setup(t);
  const start=accounts(db)[0].balanceCents;
  const created=await call('POST','/api/bank/goals',{accountId:1,name:'Computador novo',targetCents:300000});
  assert.equal(created.status,201);
  const id=created.body.goalId;
  const funded=await call('POST','/api/bank/goals/'+id+'/move',{action:'guardar',amountCents:12000});
  assert.equal(funded.status,200);
  assert.equal(accounts(db)[0].balanceCents,start-12000);
  let over=await call('POST','/api/bank/goals/'+id+'/move',{action:'resgatar',amountCents:999999});
  assert.equal(over.status,422);
  const redeemed=await call('POST','/api/bank/goals/'+id+'/move',{action:'resgatar',amountCents:2000});
  assert.equal(redeemed.status,200);
  const overview=await call('GET','/api/bank/overview?accountId=1');
  assert.equal(overview.body.totalCents,start);
  assert.equal(overview.body.reserveCents,10000);
});
test('transferência é atômica, idempotente e conserva saldos entre contas',async t=>{
  const {db,call}=await setup(t);
  const a=accounts(db);const a1=a[0].balanceCents,b1=a[1].balanceCents;
  const body={fromAccountId:1,toAccountId:2,amountCents:10230,method:'PIX simulado',
    description:'Pagamento de teste fictício',requestKey:'chave-idempotente-demo-1234'};
  const one=await call('POST','/api/bank/transfer',body);
  assert.equal(one.status,201);assert.equal(one.body.duplicated,false);
  const two=await call('POST','/api/bank/transfer',body);
  assert.equal(two.status,201);assert.equal(two.body.duplicated,true);
  const accountsAfter=accounts(db);
  assert.equal(accountsAfter[0].balanceCents,a1-10230);
  assert.equal(accountsAfter[1].balanceCents,b1+10230);
  assert.equal(accountsAfter[0].balanceCents+accountsAfter[1].balanceCents,a1+b1);
  const receipt=await call('GET','/api/bank/transfer/'+one.body.id+'/receipt');
  assert.equal(receipt.status,200);
  assert.match(receipt.body.receipt.disclaimer,/SIMULAÇÃO/);
});
test('transferência sem saldo recusa os dois lançamentos',async t=>{
  const {db,call}=await setup(t);
  const start1=accounts(db)[0].balanceCents,start2=accounts(db)[1].balanceCents;
  const result=await call('POST','/api/bank/transfer',{fromAccountId:1,toAccountId:2,
    amountCents:900000,method:'PIX simulado',description:'Teste sem saldo',
    requestKey:'chave-de-transferencia-invalida'});
  assert.equal(result.status,422);
  assert.equal(accounts(db)[0].balanceCents,start1);
  assert.equal(accounts(db)[1].balanceCents,start2);
});
test('pagamento de boleto simulado debita a conta e gera comprovante',async t=>{
  const {db,call}=await setup(t);const start=accounts(db)[0].balanceCents;
  const r=await call('POST','/api/bank/bills',{accountId:1,payee:'Fornecedor Teste',
    reference:'DEMO-REFERENCIA-001',dueOn:'2026-11-23',amountCents:3450});
  assert.equal(r.status,201);
  assert.equal(accounts(db)[0].balanceCents,start-3450);
  const receipt=await call('GET','/api/bank/receipts/'+r.body.entryId+'?accountId=1');
  assert.equal(receipt.status,200);assert.match(receipt.body.receipt.disclaimer,/DEMONSTRAÇÃO/);
  const stranger=await call('GET','/api/bank/receipts/'+r.body.entryId+'?accountId=2');
  assert.equal(stranger.status,404);
});
test('cartão fictício bloqueado impede débito manual no cartão',async t=>{
  const {db,call}=await setup(t);
  const cards=await call('GET','/api/bank/cards?accountId=1');
  assert.equal(cards.status,200);
  const cardId=cards.body.cards[0].id;
  const toggled=await call('POST','/api/bank/cards/'+cardId+'/toggle');
  assert.equal(toggled.body.status,'bloqueado');
  const result=await call('POST','/api/bank/entries',{accountId:1,kind:'saida',
    amountCents:2000,occurredOn:'2026-11-23',method:'Cartão de débito simulado',
    description:'Compra fictícia com cartão bloqueado',reference:'TEST-CARD',category:'Compras'});
  assert.equal(result.status,422);
  const other=await call('POST','/api/bank/entries',{accountId:1,kind:'saida',
    amountCents:2000,occurredOn:'2026-11-23',method:'PIX simulado',
    description:'Pagamento fictício pelo aplicativo',reference:'TEST-PIX',category:'Alimentação'});
  assert.equal(other.status,201);
  assert.equal(db.prepare('SELECT category FROM bank_entry_categories WHERE entry_id=?').get(other.body.id).category,'Alimentação');
});
test('agendamento: cria, não permite antecipação, executa e não repete',async t=>{
  const {call,db}=await setup(t);
  const future='2099-12-12';
  const a=await call('POST','/api/bank/schedules',{accountId:1,kind:'pix',toAccountId:2,
    amountCents:1500,dueOn:future,description:'Pix de teste agendado'});
  assert.equal(a.status,201);
  const now=await call('POST','/api/bank/schedules/'+a.body.scheduleId+'/execute');
  assert.equal(now.status,422);
  const canceled=await call('POST','/api/bank/schedules/'+a.body.scheduleId+'/cancel');
  assert.equal(canceled.status,200);
  const canceledExecution=await call('POST','/api/bank/schedules/'+a.body.scheduleId+'/execute');
  assert.equal(canceledExecution.status,409);
  // vencido/presente; execução feita por ação explícita do usuário
  const due=new Date().toISOString().slice(0,10);
  const b=await call('POST','/api/bank/schedules',{accountId:1,kind:'pix',toAccountId:2,
    amountCents:1500,dueOn:due,description:'Pix demonstrativo do dia'});
  assert.equal(b.status,201);
  const start1=accounts(db)[0].balanceCents;
  assert.equal((await call('POST','/api/bank/schedules/'+b.body.scheduleId+'/execute')).status,200);
  assert.equal(accounts(db)[0].balanceCents,start1-1500);
  assert.equal((await call('POST','/api/bank/schedules/'+b.body.scheduleId+'/execute')).status,409);
});
test('analítica, orçamento e auditoria funcionam por conta',async t=>{
  const {call}=await setup(t);
  const result=await call('PUT','/api/bank/budgets',{accountId:1,category:'Alimentação',month:'2026-11',limitCents:50000});
  assert.equal(result.status,200);
  const anal=await call('GET','/api/bank/analytics?accountId=1&month=2026-11');
  assert.equal(anal.status,200);
  assert.equal(anal.body.budgets[0].limitCents,50000);
  const audit=await call('GET','/api/bank/activity?accountId=1');
  assert.ok(audit.body.items.some(e=>e.action==='ORCAMENTO_ALTERADO'));
});
test('exige autenticação para todos os módulos privados',async t=>{
  const {url}=await setup(t);
  for(const path of ['/api/bank/goals?accountId=1','/api/bank/analytics?accountId=1',
    '/api/bank/cards?accountId=1','/api/bank/activity?accountId=1']){
    assert.equal((await fetch(url+path)).status,401);
  }
});

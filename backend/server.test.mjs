import test from 'node:test';
import assert from 'node:assert/strict';
import {openDb,createApp,accounts,statement,createEntry,validateEntry} from './server.mjs';
const input=(accountId,kind,amountCents,date='2026-11-22')=>({
  accountId,kind,amountCents,occurredOn:date,method:'PIX simulado',
  description:'Lançamento fictício para teste',reference:'TESTE-01'
});
test('semeia contas e calcula saldo sem ponto flutuante',t=>{
  const db=openDb(':memory:');t.after(()=>db.close());
  const items=accounts(db);
  assert.equal(items.length,3);assert.equal(items[0].code,'SIM-00001');
  assert.equal(items[0].balanceCents,350000-7990+124500-24990-10000);
  const rows=statement(db,new URLSearchParams('accountId=1'));
  assert.equal(rows.summary.balanceCents,items[0].balanceCents);
  assert.ok(rows.entries.every(e=>Number.isInteger(e.balanceAfterCents)&&e.balanceAfterCents>=0));
});
test('registra entradas e saídas com valor exato em centavos',t=>{
  const db=openDb(':memory:');t.after(()=>db.close());
  const start=accounts(db)[0].balanceCents;
  createEntry(db,input(1,'entrada',101));createEntry(db,input(1,'saida',100));
  assert.equal(accounts(db)[0].balanceCents,start+1);
});
test('saque insuficiente reverte transação',t=>{
  const db=openDb(':memory:');t.after(()=>db.close());
  const n=statement(db,new URLSearchParams('accountId=2')).summary.count;
  assert.throws(()=>createEntry(db,input(2,'saida',99999999)),/Saldo insuficiente/);
  assert.equal(statement(db,new URLSearchParams('accountId=2')).summary.count,n);
});
test('impede saída retroativa sem saldo',t=>{
  const db=openDb(':memory:');t.after(()=>db.close());
  assert.throws(()=>createEntry(db,input(3,'saida',94000,'2026-11-01')),/Saldo insuficiente/);
});
test('valida valor, data e filtros',t=>{
  assert.throws(()=>validateEntry(input(1,'entrada',0)),/Valor/);
  assert.throws(()=>validateEntry(input(1,'entrada',10.5)),/Valor/);
  assert.throws(()=>validateEntry(input(1,'entrada',100,'2026-02-30')),/Data/);
  const db=openDb(':memory:');t.after(()=>db.close());
  const s=statement(db,new URLSearchParams('accountId=1&from=2026-11-12&to=2026-11-20&kind=saida'));
  assert.equal(s.entries.length,2);
  assert.equal(s.summary.balanceCents,accounts(db)[0].balanceCents);
});
test('API HTTP exige token, cadastra contas, envia lançamentos e exporta CSV',async t=>{
  const db=openDb(':memory:');const server=createApp({db,token:'token-ficticio-bastante-seguro'});
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
  t.after(async()=>{await new Promise(ok=>server.close(ok));db.close()});
  const origin='http://127.0.0.1:'+server.address().port;
  const auth={Authorization:'Bearer token-ficticio-bastante-seguro'};
  assert.equal((await fetch(origin+'/api/bank/accounts')).status,401);
  assert.equal((await fetch(origin+'/api/health')).status,200);
  const r=await fetch(origin+'/api/bank/accounts',{method:'POST',
    headers:{...auth,'Content-Type':'application/json'},body:JSON.stringify({holder:'Cliente de Teste Fictício'})});
  assert.equal(r.status,201);
  const accountId=(await r.json()).account.id;
  for(const kind of ['entrada','saida']){
    const post=await fetch(origin+'/api/bank/entries',{method:'POST',
      headers:{...auth,'Content-Type':'application/json'},body:JSON.stringify(input(accountId,kind,10000))});
    assert.equal(post.status,201);
  }
  const r2=await fetch(origin+'/api/bank/entries?accountId='+accountId,{headers:auth});
  assert.equal((await r2.json()).summary.balanceCents,0);
  const csv=await fetch(origin+'/api/bank/statement.csv?accountId='+accountId,{headers:auth});
  assert.equal(csv.status,200);assert.match(await csv.text(),/Forma de pagamento/);
});

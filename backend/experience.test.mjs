import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp,openDb,accounts,createEntry} from './server.mjs';

async function setup(t){
  const db=openDb(':memory:');
  const server=createApp({db,token:'token-escola-seguro-para-testes'});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));db.close()});
  const origin='http://127.0.0.1:'+server.address().port;
  async function api(method,path,body,withAuth=true){
    const res=await fetch(origin+path,{
      method,headers:{...(withAuth?{Authorization:'Bearer token-escola-seguro-para-testes'}:{}),
        ...(body?{'Content-Type':'application/json'}:{})},
      ...(body?{body:JSON.stringify(body)}:{})
    });
    return {status:res.status,body:await res.json()};
  }
  return {db,api};
}
test('contatos salvos funcionam e não aceitam mesma conta',async t=>{
  const {api}=await setup(t);
  const initial=await api('GET','/api/bank/favorites?accountId=1');
  assert.equal(initial.status,200);
  assert.equal(initial.body.favorites.length,0);
  const own=await api('POST','/api/bank/favorites',{accountId:1,toAccountId:1});
  assert.equal(own.status,400);
  const add=await api('POST','/api/bank/favorites',{accountId:1,toAccountId:2});
  assert.equal(add.status,201);assert.equal(add.body.saved,true);
  const again=await api('POST','/api/bank/favorites',{accountId:1,toAccountId:2});
  assert.equal(again.status,201);assert.equal(again.body.saved,false);
  const listed=await api('GET','/api/bank/favorites?accountId=1');
  assert.equal(listed.body.favorites.length,1);
  assert.equal(listed.body.favorites[0].code,'SIM-00002');
  const separate=await api('GET','/api/bank/favorites?accountId=2');
  assert.equal(separate.body.favorites.length,0);
  const removed=await api('DELETE','/api/bank/favorites/2?accountId=1');
  assert.equal(removed.status,200);
  assert.equal((await api('GET','/api/bank/favorites?accountId=1')).body.favorites.length,0);
});
test('limites de Pix são aplicados antes de movimentar saldos',async t=>{
  const {db,api}=await setup(t);
  const before=accounts(db)[0].balanceCents;
  const defaults=await api('GET','/api/bank/limits?accountId=1');
  assert.equal(defaults.status,200);
  assert.equal(defaults.body.limits.maxPerTransferCents,1_000_000);
  const bad=await api('PUT','/api/bank/limits',{
    accountId:1,maxPerTransferCents:300_000,maxDailyCents:100_000
  });
  assert.equal(bad.status,400);
  const configured=await api('PUT','/api/bank/limits',{
    accountId:1,maxPerTransferCents:500_000,maxDailyCents:600_000
  });
  assert.equal(configured.status,200);
  const tooBig=await api('POST','/api/bank/transfer',{
    fromAccountId:1,toAccountId:2,amountCents:500_001,method:'PIX simulado',
    description:'Teste de limites',requestKey:'limite-unitario-teste-01'
  });
  assert.equal(tooBig.status,422);
  assert.equal(accounts(db)[0].balanceCents,before);
});
test('limite diário considera transferências realizadas hoje e bloqueia excesso',async t=>{
  const {db,api}=await setup(t);
  const today=new Date().toISOString().slice(0,10);
  createEntry(db,{accountId:1,kind:'entrada',amountCents:1_200_000,
    occurredOn:today,method:'Dinheiro fictício',description:'Crédito apenas para teste',reference:'TESTE'});
  const set=await api('PUT','/api/bank/limits',{
    accountId:1,maxPerTransferCents:300_000,maxDailyCents:500_000
  });
  assert.equal(set.status,200);
  const first=await api('POST','/api/bank/transfer',{
    fromAccountId:1,toAccountId:2,amountCents:290_000,method:'PIX simulado',
    description:'Primeira remessa fictícia',requestKey:'envio-primeiro-12345'
  });
  assert.equal(first.status,201);
  const second=await api('POST','/api/bank/transfer',{
    fromAccountId:1,toAccountId:2,amountCents:290_000,method:'PIX simulado',
    description:'Segunda remessa fictícia',requestKey:'envio-segundo-12345'
  });
  assert.equal(second.status,422);
  const limits=(await api('GET','/api/bank/limits?accountId=1')).body.limits;
  assert.equal(limits.usedCents,290_000);
  assert.equal(limits.remainingCents,210_000);
});
test('extrato pesquisável por descrição e categoria preserva saldo verdadeiro',async t=>{
  const {db,api}=await setup(t);
  const original=accounts(db)[0].balanceCents;
  const created=await api('POST','/api/bank/entries',{
    accountId:1,kind:'saida',amountCents:1000,occurredOn:'2026-11-23',
    method:'PIX simulado',description:'Sorvete de demonstração',reference:'SOR-001',category:'Alimentação'
  });
  assert.equal(created.status,201);
  const byKeyword=await api('GET','/api/bank/entries?accountId=1&q=sorvete');
  assert.equal(byKeyword.status,200);
  assert.equal(byKeyword.body.entries.length,1);
  assert.equal(byKeyword.body.entries[0].category,'Alimentação');
  const byCategory=await api('GET','/api/bank/entries?accountId=1&category=Alimenta%C3%A7%C3%A3o');
  assert.equal(byCategory.body.entries.length,1);
  assert.equal(byCategory.body.summary.balanceCents,original-1000);
  const empty=await api('GET','/api/bank/entries?accountId=1&category=Sa%C3%BAde&q=Sorvete');
  assert.equal(empty.body.entries.length,0);
  assert.equal(empty.body.summary.balanceCents,original-1000);
});
test('rotas de favoritos e limites exigem autenticação',async t=>{
  const {api}=await setup(t);
  assert.equal((await api('GET','/api/bank/favorites?accountId=1',undefined,false)).status,401);
  assert.equal((await api('GET','/api/bank/limits?accountId=1',undefined,false)).status,401);
});

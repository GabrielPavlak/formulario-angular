import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createApp, openDb, validateForm, validateAnswers } from './server.mjs';
const form=JSON.parse(readFileSync(new URL('./questions.json',import.meta.url),'utf8'));
const answers=Object.fromEntries(form.perguntas.map(q=>[
  q.id, q.tipo==='caixas' ? [q.opcoes[0]] : q.opcoes.length ? q.opcoes[0] : 'Teste'
]));
test('questionário inicial contém 14 questões válidas',()=>{
  validateForm(form);
  assert.equal(form.perguntas.length,14);
});
test('rejeita respostas obrigatórias não preenchidas',()=>{
  assert.throws(()=>validateAnswers({valores:{}},form), /obrigatória/);
});
test('rejeita alternativa inexistente',()=>{
  assert.throws(()=>validateAnswers({valores:{...answers,faixa:'Não existe'}},form), /Opção inválida/);
});
test('aceita respostas válidas',()=>{
  assert.deepEqual(validateAnswers({valores:answers},form),answers);
});
test('API persiste respostas e protege recursos administrativos',async t=>{
  const db=openDb(':memory:');
  const server=createApp({db,token:'token-de-teste-super-seguro'});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));db.close()});
  const base='http://127.0.0.1:'+server.address().port;
  const head={Authorization:'Bearer token-de-teste-super-seguro'};
  const get=async(path,headers)=>fetch(base+path,{headers});
  const formResponse=await get('/api/form');
  assert.equal(formResponse.status,200);
  assert.equal((await formResponse.json()).perguntas.length,14);
  assert.equal((await get('/api/responses')).status,401);
  const submitted=await fetch(base+'/api/responses',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({valores:answers})});
  assert.equal(submitted.status,201);
  const stored=await get('/api/responses',head);
  assert.equal((await stored.json()).respostas.length,1);
  assert.equal((await get('/api/responses.csv',head)).status,200);
});

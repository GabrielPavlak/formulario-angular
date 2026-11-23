import { Component, computed, HostListener, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

interface Conta { id:number; code:string; holder:string; agency:string; balanceCents:number; entriesCount:number; createdAt:string }
type Tipo = 'entrada'|'saida';
interface Registro { id:number; accountId:number; kind:Tipo; amountCents:number; occurredOn:string; method:string; description:string; reference:string; category:string; createdAt:string; balanceAfterCents:number }
interface Resumo { accountId:number; balanceCents:number; incomeCents:number; expenseCents:number; count:number }
type Aba='painel'|'lancamento'|'extrato'|'contas'|'transferir'|'pagamentos'|'agendamentos'|'metas'|'cartoes'|'analises'|'atividade'|'servicos'|'seguranca'|'avisos'|'ajuda';
interface Meta {id:number;accountId:number;name:string;targetCents:number;balanceCents:number;createdAt:string}
interface Cartao {id:number;accountId:number;displayCode:string;status:string;createdAt:string}
interface Agenda {id:number;accountId:number;toAccountId:number|null;kind:'pix'|'boleto';amountCents:number;dueOn:string;description:string;status:string;createdAt:string;executedAt:string}
interface Atividade {id:number;action:string;detail:string;createdAt:string}
interface Analise {month:string;incomeCents:number;expenseCents:number;byCategory:Record<string,number>;budgets:{category:string;limitCents:number}[];history:{month:string;incomeCents:number;expenseCents:number}[]}
interface Geral {checkingCents:number;reserveCents:number;totalCents:number;pendingSchedules:number;cardStatus:string}
interface RevisaoOperacao {tipo:'transferencia'|'pagamento';destino:string;descricao:string;valorCentavos:number;metodo:string;saldoPrevistoCentavos:number;referencia:string}
interface Filtros { from:string; to:string; kind:string; method:string; category:string; q:string }
interface NovoRegistro { kind:Tipo; amount:string; occurredOn:string; method:string; description:string; reference:string }
function hojeLocal():string {
  const date=new Date();
  return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
}
export function paraCentavos(input:string):number|null {
  const text=input.trim();
  if(!/^\d{1,7}([,.]\d{1,2})?$/.test(text))return null;
  const [reais,centavos='']=text.split(/[,.]/);
  const amount=Number(reais)*100+Number(centavos.padEnd(2,'0'));
  return Number.isSafeInteger(amount)&&amount>0?amount:null;
}
@Component({selector:'app-root',imports:[FormsModule],templateUrl:'./app.html',styleUrl:'./app.css'})
export class App implements OnInit {
  protected readonly view=signal<Aba>('painel');
  protected readonly token=signal(sessionStorage.getItem('banco-escola:token')??'');
  protected readonly logado=signal(false);
  protected readonly carregando=signal(false);
  protected readonly salvando=signal(false);
  protected readonly erro=signal('');
  protected readonly aviso=signal('');
  protected readonly contas=signal<Conta[]>([]);
  protected readonly registros=signal<Registro[]>([]);
  protected readonly contaId=signal(0);
  protected readonly resumo=signal<Resumo|null>(null);
  protected readonly atual=computed(()=>this.contas().find(c=>c.id===this.contaId())??null);
  protected readonly metodos=[
    'PIX simulado','Transferência simulada','Boleto simulado',
    'Cartão de débito simulado','Dinheiro fictício'
  ];
  protected filtros:Filtros={from:'',to:'',kind:'',method:'',category:'',q:''};
  protected novo:NovoRegistro={
    kind:'entrada',amount:'',occurredOn:hojeLocal(),method:'PIX simulado',description:'',reference:''
  };
  protected titular='';
  protected readonly categorias=['Alimentação','Casa','Educação','Lazer','Saúde','Transporte','Compras','Serviços','Salário','Transferências','Reserva','Outros'];
  protected readonly metas=signal<Meta[]>([]);
  protected readonly cartoes=signal<Cartao[]>([]);
  protected readonly agendas=signal<Agenda[]>([]);
  protected readonly atividades=signal<Atividade[]>([]);
  protected readonly geral=signal<Geral|null>(null);
  protected readonly analise=signal<Analise|null>(null);
  protected readonly reservaTotal=computed(()=>this.metas().reduce((v,m)=>v+m.balanceCents,0));
  protected readonly contasDestino=computed(()=>this.contas().filter(c=>c.id!==this.contaId()));
  protected readonly comprovante=signal<string|null>(null);
  protected readonly revisao=signal<RevisaoOperacao|null>(null);
  private chaveTransferencia: {assinatura:string;chave:string}|null=null;
  protected readonly picoHistorico=computed(()=>Math.max(1,...(this.analise()?.history??[])
    .flatMap(item=>[item.incomeCents,item.expenseCents])));
  protected alturaGrafico(value:number):number{
    return value>0?Math.max(5,Math.min(100,Math.round(value/this.picoHistorico()*100))):0;
  }
  protected readonly ocultarValores=signal(sessionStorage.getItem('banco-escola:ocultar-valores')==='1');
  protected readonly favoritos=signal<{id:number;holder:string;code:string;createdAt:string}[]>([]);
  protected readonly limites=signal<{maxPerTransferCents:number;maxDailyCents:number;usedCents:number;remainingCents:number}|null>(null);
  protected limiteForm={porOperacao:'10000',diario:'20000'};
  protected readonly nomeCurto=computed(()=>this.atual()?.holder?.split(' ')[0]??'Visitante');
  protected readonly notificacoesPendentes=computed(()=>this.agendas().filter(a=>a.status==='pendente').length);
  protected readonly categoriasPrincipais=computed(()=>Object.entries(this.analise()?.byCategory??{}).filter(x=>x[1]>0)
      .sort((a,b)=>b[1]-a[1]).slice(0,4).map(([name,value])=>({name,value})));
  protected readonly dataCabecalho=new Intl.DateTimeFormat('pt-BR',{weekday:'long',day:'numeric',month:'long'}).format(new Date());
  protected readonly titulos:Record<Aba,string>={
    painel:'Visão geral',lancamento:'Movimentar saldo',extrato:'Meu extrato',contas:'Minhas contas',
    transferir:'Pix e transferências',pagamentos:'Pagamentos',agendamentos:'Agendamentos',
    metas:'Minhas metas',cartoes:'Meus cartões',analises:'Controle financeiro',
    atividade:'Histórico de atividades',servicos:'Todos os serviços',seguranca:'Segurança e limites',
    avisos:'Central de avisos',ajuda:'Ajuda e informações'
  };
  protected mesAnalise=hojeLocal().slice(0,7);
  protected categoria='Outros';
  protected transfer={toAccountId:0,amount:'',method:'PIX simulado',description:'Transferência de demonstração'};
  protected bill={payee:'',reference:'DEMO-BOLETO-',amount:'',dueOn:hojeLocal()};
  protected agendaForm:{kind:'pix'|'boleto';toAccountId:number;amount:string;dueOn:string;description:string}=
    {kind:'pix',toAccountId:0,amount:'',dueOn:hojeLocal(),description:'Agendamento de demonstração'};
  protected novaMeta={name:'',target:''};
  protected reservaForm:{goalId:number;action:'guardar'|'resgatar';amount:string}={goalId:0,action:'guardar',amount:''};
  protected orcamento={category:'Alimentação',amount:''};
  protected valorCategoria(category:string):number{return this.analise()?.byCategory[category]??0;}
  protected larguraBarra(value:number,max:number):number{return max>0?Math.min(100,Math.round(value/max*100)):0;}
  protected totalAnalise():number{return Math.max(1,...Object.values(this.analise()?.byCategory??{}));}
  protected limiteCategoria(cat:string):number{return this.analise()?.budgets.find(b=>b.category===cat)?.limitCents??0;}
  async ngOnInit():Promise<void>{
    if(this.token())await this.entrar();
  }
  private async api<T>(path:string,init:RequestInit={}):Promise<T>{
    const response=await fetch(path,{
      ...init,
      headers:{Authorization:'Bearer '+this.token(),'Content-Type':'application/json',...(init.headers??{})}
    });
    const data=await response.json().catch(()=>null);
    if(!response.ok)throw Error(data?.error??'Falha HTTP '+response.status);
    return data as T;
  }
  protected dinheiro(value:number):string{
    return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(value/100);
  }
  protected dataBR(date:string):string{
    const [y,m,d]=date.split('-');
    return y&&m&&d?d+'/'+m+'/'+y:date;
  }
  protected abrir(v:Aba):void{
    this.view.set(v);this.erro.set('');this.aviso.set('');
    this.revisao.set(null);
  }
  protected async entrar():Promise<void>{
    if(!this.token()){this.erro.set('Informe o token do backend.');return;}
    this.carregando.set(true);this.erro.set('');
    try{
      await this.carregarContas();
      this.logado.set(true);
      sessionStorage.setItem('banco-escola:token',this.token());
      await this.carregarExtrato();
      await this.carregarExtras();
    }catch(e){
      this.logado.set(false);
      this.erro.set(e instanceof Error?e.message:'Não foi possível conectar ao servidor.');
    }finally{this.carregando.set(false);}
  }
  protected sair():void{
    sessionStorage.removeItem('banco-escola:token');
    this.token.set('');this.logado.set(false);
    this.contas.set([]);this.registros.set([]);this.resumo.set(null);
    this.favoritos.set([]);this.limites.set(null);
    this.aviso.set('');this.erro.set('');this.view.set('painel');
    this.revisao.set(null);this.chaveTransferencia=null;
  }
  private async carregarContas():Promise<void>{
    const data=await this.api<{accounts:Conta[]}>('/api/bank/accounts');
    this.contas.set(data.accounts);
    if(!data.accounts.some(c=>c.id===this.contaId()))this.contaId.set(data.accounts[0]?.id??0);
  }
  protected async selecionarConta(value:number|string):Promise<void>{
    this.contaId.set(Number(value));this.limparFiltros(false);
    await this.carregarExtrato();
    await this.carregarExtras();
  }
  private query():string{
    const args=new URLSearchParams({accountId:String(this.contaId())});
    if(this.filtros.from)args.set('from',this.filtros.from);
    if(this.filtros.to)args.set('to',this.filtros.to);
    if(this.filtros.kind)args.set('kind',this.filtros.kind);
    if(this.filtros.method)args.set('method',this.filtros.method);
    if(this.filtros.category)args.set('category',this.filtros.category);
    if(this.filtros.q.trim())args.set('q',this.filtros.q.trim());
    return args.toString();
  }
  protected async carregarExtrato():Promise<void>{
    if(!this.contaId())return;
    this.carregando.set(true);this.erro.set('');
    try{
      const data=await this.api<{entries:Registro[];summary:Resumo}>('/api/bank/entries?'+this.query());
      this.registros.set(data.entries);this.resumo.set(data.summary);
    }catch(e){this.erro.set(e instanceof Error?e.message:'Erro ao consultar extrato.');}
    finally{this.carregando.set(false);}
  }
  protected limparFiltros(reload=true):void{
    this.filtros={from:'',to:'',kind:'',method:'',category:'',q:''};
    if(reload)void this.carregarExtrato();
  }
  protected async registrar():Promise<void>{
    const amountCents=paraCentavos(this.novo.amount);
    if(amountCents===null){this.erro.set('Informe um valor positivo, por exemplo: 150,75.');return;}
    if(!this.novo.description.trim()){this.erro.set('Preencha a descrição do lançamento.');return;}
    this.salvando.set(true);this.erro.set('');this.aviso.set('');
    try{
      await this.api('/api/bank/entries',{method:'POST',body:JSON.stringify({
        accountId:this.contaId(),kind:this.novo.kind,amountCents,occurredOn:this.novo.occurredOn,
        method:this.novo.method,description:this.novo.description,reference:this.novo.reference,category:this.categoria
      })});
      this.novo={kind:'entrada',amount:'',occurredOn:hojeLocal(),method:'PIX simulado',description:'',reference:''};
      this.limparFiltros(false);
      await this.carregarContas();
      await this.carregarExtrato();
      await this.carregarExtras();
      this.view.set('extrato');this.aviso.set('Movimentação fictícia registrada no extrato.');
    }catch(e){this.erro.set(e instanceof Error?e.message:'Não foi possível registrar.');}
    finally{this.salvando.set(false);}
  }
  protected async criarConta():Promise<void>{
    if(this.titular.trim().length<3){this.erro.set('Informe uma identificação fictícia de pelo menos 3 caracteres.');return;}
    this.salvando.set(true);this.erro.set('');this.aviso.set('');
    try{
      const result=await this.api<{account:Conta}>('/api/bank/accounts',{method:'POST',
        body:JSON.stringify({holder:this.titular})});
      this.titular='';await this.carregarContas();
      this.contaId.set(result.account.id);
      this.limparFiltros(false);await this.carregarExtrato();await this.carregarExtras();
      this.view.set('lancamento');
      this.aviso.set('Conta fictícia criada. Registre uma entrada inicial antes de realizar saídas.');
    }catch(e){this.erro.set(e instanceof Error?e.message:'Falha ao criar conta.');}
    finally{this.salvando.set(false);}
  }
  protected async exportarCSV():Promise<void>{
    try{
      const response=await fetch('/api/bank/statement.csv?'+this.query(),{
        headers:{Authorization:'Bearer '+this.token()}
      });
      if(!response.ok)throw Error((await response.json().catch(()=>null))?.error??'Falha na exportação');
      const url=URL.createObjectURL(await response.blob());
      const link=document.createElement('a');link.href=url;link.download='extrato-banco-ficticio.csv';link.click();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch(e){this.erro.set(e instanceof Error?e.message:'Não foi possível exportar o extrato.');}
  }
  private async carregarExtras():Promise<void>{
    if(!this.contaId())return;
    const id=this.contaId();
    const idQuery='?accountId='+id;
    try{
      const [goals,cards,schedules,activity,overview,analytics,favorites,limits]=await Promise.all([
        this.api<{goals:Meta[]}>('/api/bank/goals'+idQuery),
        this.api<{cards:Cartao[]}>('/api/bank/cards'+idQuery),
        this.api<{schedules:Agenda[]}>('/api/bank/schedules'+idQuery),
        this.api<{items:Atividade[]}>('/api/bank/activity'+idQuery),
        this.api<Geral>('/api/bank/overview'+idQuery),
        this.api<Analise>('/api/bank/analytics'+idQuery+'&month='+this.mesAnalise),
        this.api<{favorites:{id:number;holder:string;code:string;createdAt:string}[]}>('/api/bank/favorites'+idQuery),
        this.api<{limits:{maxPerTransferCents:number;maxDailyCents:number;usedCents:number;remainingCents:number}}>('/api/bank/limits'+idQuery)
      ]);
      this.metas.set(goals.goals);this.cartoes.set(cards.cards);this.agendas.set(schedules.schedules);
      this.atividades.set(activity.items);this.geral.set(overview);this.analise.set(analytics);
      this.favoritos.set(favorites.favorites);this.limites.set(limits.limits);
      this.limiteForm={porOperacao:String(limits.limits.maxPerTransferCents/100),
        diario:String(limits.limits.maxDailyCents/100)};
      if(!this.contasDestino().some(c=>c.id===this.transfer.toAccountId))
        this.transfer.toAccountId=this.contasDestino()[0]?.id??0;
      if(!this.contasDestino().some(c=>c.id===this.agendaForm.toAccountId))
        this.agendaForm.toAccountId=this.contasDestino()[0]?.id??0;
      if(!this.metas().some(g=>g.id===this.reservaForm.goalId))
        this.reservaForm.goalId=this.metas()[0]?.id??0;
    }catch(e){this.erro.set(e instanceof Error?e.message:'Não foi possível carregar módulos financeiros.');}
  }
  private async atualizarTudo():Promise<void>{
    await this.carregarContas();await this.carregarExtrato();await this.carregarExtras();
  }
  private parseValor(text:string):number{
    const cents=paraCentavos(text);
    if(cents===null)throw Error('Digite um valor positivo. Exemplo: 125,50.');
    return cents;
  }
  private async executar(action:()=>Promise<unknown>,success:string):Promise<boolean>{
    this.salvando.set(true);this.erro.set('');this.aviso.set('');
    try{
      await action();await this.atualizarTudo();
      this.aviso.set(success);return true;
    }catch(e){this.erro.set(e instanceof Error?e.message:'Não foi possível concluir a operação fictícia.');return false;}
    finally{this.salvando.set(false);}
  }

  /** Etapa de conferência: nenhum lançamento é enviado antes da confirmação. */
  protected revisarTransferencia():void {
    this.erro.set('');
    const cents=paraCentavos(this.transfer.amount);
    if(cents===null){this.erro.set('Informe um valor positivo com até dois centavos decimais.');return;}
    const destinatario=this.contasDestino().find(c=>c.id===this.transfer.toAccountId);
    if(!destinatario){this.erro.set('Selecione uma conta fictícia de destino.');return;}
    if(this.transfer.description.trim().length<3){this.erro.set('Informe a descrição da transferência.');return;}
    const disponivel=this.atual()?.balanceCents??0;
    if(cents>disponivel){this.erro.set('Saldo fictício insuficiente para esta transferência.');return;}
    const limites=this.limites();
    if(limites&&(cents>limites.maxPerTransferCents||cents>limites.remainingCents)){
      this.erro.set('Valor excede o limite fictício disponível. Consulte Segurança e limites.');return;
    }
    this.revisao.set({
      tipo:'transferencia',destino:destinatario.holder+' • '+destinatario.code,
      descricao:this.transfer.description.trim(),valorCentavos:cents,
      metodo:this.transfer.method,referencia:'Transferência interna DEMO',
      saldoPrevistoCentavos:disponivel-cents
    });
  }
  protected revisarPagamento():void {
    this.erro.set('');
    const cents=paraCentavos(this.bill.amount);
    if(cents===null){this.erro.set('Informe um valor de pagamento válido.');return;}
    if(this.bill.payee.trim().length<3){this.erro.set('Informe um favorecido fictício.');return;}
    if(this.bill.reference.trim().length<3){this.erro.set('Informe a referência do boleto demonstrativo.');return;}
    const disponivel=this.atual()?.balanceCents??0;
    if(cents>disponivel){this.erro.set('Saldo fictício insuficiente para este pagamento.');return;}
    this.revisao.set({
      tipo:'pagamento',destino:this.bill.payee.trim(),descricao:'Boleto de demonstração',
      valorCentavos:cents,metodo:'Boleto simulado',referencia:this.bill.reference.trim(),
      saldoPrevistoCentavos:disponivel-cents
    });
  }
  @HostListener('document:keydown.escape')
  protected fecharSobreposicoes():void{
    if(this.revisao())this.revisao.set(null);
    else if(this.comprovante())this.comprovante.set(null);
  }
  protected async confirmarRevisao():Promise<void>{
    if(this.salvando())return;
    const revisao=this.revisao();
    if(!revisao)return;
    this.revisao.set(null);
    if(revisao.tipo==='transferencia')await this.transferir();
    else await this.pagar();
  }

  protected async transferir():Promise<void>{
    let cents:number;
    try{cents=this.parseValor(this.transfer.amount);}catch(e){this.erro.set((e as Error).message);return;}
    const dest=this.transfer.toAccountId;
    if(!dest||dest===this.contaId()){this.erro.set('Escolha uma conta destinatária diferente.');return;}
    if(this.transfer.description.trim().length<3){this.erro.set('Informe uma descrição para a transferência.');return;}
    const assinatura=JSON.stringify([this.contaId(),dest,cents,this.transfer.method,this.transfer.description.trim()]);
    if(!this.chaveTransferencia||this.chaveTransferencia.assinatura!==assinatura){
      this.chaveTransferencia={
        assinatura,chave:globalThis.crypto?.randomUUID?.()??('DEMO-'+Date.now()+'-'+Math.random())
      };
    }
    const key=this.chaveTransferencia.chave;
    const ok=await this.executar(async()=>{
      const result=await this.api<{id:number;duplicated:boolean}>('/api/bank/transfer',{method:'POST',
        body:JSON.stringify({fromAccountId:this.contaId(),toAccountId:dest,amountCents:cents,
        method:this.transfer.method,description:this.transfer.description,requestKey:key})});
      const recipient=this.contas().find(c=>c.id===dest);
      this.comprovante.set('COMPROVANTE DE SIMULAÇÃO\nTransferência fictícia #'+result.id+
        '\nOrigem: '+this.atual()?.code+'\nDestino: '+(recipient?.code??dest)+
        '\nValor: '+this.dinheiro(cents)+'\nMétodo: '+this.transfer.method+'\nNÃO É COMPROVANTE BANCÁRIO REAL.');
    },'Transferência entre contas fictícias concluída.');
    if(ok){this.transfer.amount='';this.chaveTransferencia=null;this.view.set('extrato');}
  }
  protected async pagar():Promise<void>{
    const ok=await this.executar(async()=>{
      await this.api('/api/bank/bills',{method:'POST',body:JSON.stringify({
        accountId:this.contaId(),amountCents:this.parseValor(this.bill.amount),
        payee:this.bill.payee,reference:this.bill.reference,dueOn:this.bill.dueOn
      })});
    },'Boleto fictício pago. O extrato foi atualizado.');
    if(ok){this.bill={payee:'',reference:'DEMO-BOLETO-',amount:'',dueOn:hojeLocal()};this.view.set('extrato');}
  }
  protected async agendar():Promise<void>{
    const ok=await this.executar(async()=>{
      await this.api('/api/bank/schedules',{method:'POST',body:JSON.stringify({
        accountId:this.contaId(),toAccountId:this.agendaForm.kind==='pix'?this.agendaForm.toAccountId:null,
        kind:this.agendaForm.kind,amountCents:this.parseValor(this.agendaForm.amount),
        dueOn:this.agendaForm.dueOn,description:this.agendaForm.description
      })});
    },'Agendamento fictício criado. Execute-o manualmente na data prevista.');
    if(ok)this.agendaForm.amount='';
  }
  protected async executarAgenda(id:number):Promise<void>{
    await this.executar(()=>this.api('/api/bank/schedules/'+id+'/execute',{method:'POST'}),
      'Agendamento executado. Os saldos foram atualizados.');
  }
  protected async cancelarAgenda(id:number):Promise<void>{
    await this.executar(()=>this.api('/api/bank/schedules/'+id+'/cancel',{method:'POST'}),
      'Agendamento cancelado.');
  }
  protected async criarMeta():Promise<void>{
    const ok=await this.executar(()=>this.api('/api/bank/goals',{method:'POST',
      body:JSON.stringify({accountId:this.contaId(),name:this.novaMeta.name,
        targetCents:this.parseValor(this.novaMeta.target)})}),'Meta de reserva fictícia criada.');
    if(ok)this.novaMeta={name:'',target:''};
  }
  protected async movimentarMeta():Promise<void>{
    await this.executar(()=>this.api('/api/bank/goals/'+this.reservaForm.goalId+'/move',{
      method:'POST',body:JSON.stringify({action:this.reservaForm.action,
        amountCents:this.parseValor(this.reservaForm.amount)})}),
      this.reservaForm.action==='guardar'?'Valor reservado na meta fictícia.':'Valor resgatado para a conta fictícia.');
    this.reservaForm.amount='';
  }
  protected async alternarCartao(cardId:number):Promise<void>{
    await this.executar(()=>this.api('/api/bank/cards/'+cardId+'/toggle',{method:'POST'}),
      'Situação do cartão fictício atualizada.');
  }
  protected async atualizarAnalise():Promise<void>{
    this.erro.set('');
    try{
      const data=await this.api<Analise>('/api/bank/analytics?accountId='+this.contaId()+'&month='+this.mesAnalise);
      this.analise.set(data);
    }catch(e){this.erro.set(e instanceof Error?e.message:'Falha ao carregar análises.');}
  }
  protected async definirOrcamento():Promise<void>{
    const ok=await this.executar(()=>this.api('/api/bank/budgets',{method:'PUT',
      body:JSON.stringify({accountId:this.contaId(),category:this.orcamento.category,
        month:this.mesAnalise,limitCents:this.parseValor(this.orcamento.amount)})}),
      'Limite de orçamento fictício configurado.');
    if(ok)this.orcamento.amount='';
  }
  protected async verComprovante(entryId:number):Promise<void>{
    try{
      const result=await this.api<{receipt:{id:number;kind:string;amountCents:number;method:string;
        description:string;occurredOn:string;reference:string;disclaimer:string}}>(
          '/api/bank/receipts/'+entryId+'?accountId='+this.contaId());
      const r=result.receipt;
      this.comprovante.set('COMPROVANTE DE SIMULAÇÃO\nRegistro #'+r.id+
        '\nData: '+this.dataBR(r.occurredOn)+'\n'+r.description+
        '\n'+(r.kind==='entrada'?'Entrada: ':'Saída: ')+this.dinheiro(r.amountCents)+
        '\nForma: '+r.method+'\nReferência: '+(r.reference||'—')+'\n'+r.disclaimer);
    }catch(e){this.erro.set(e instanceof Error?e.message:'Não foi possível emitir comprovante.');}
  }
  protected copiarComprovante():void{
    const text=this.comprovante();
    if(text)void navigator.clipboard.writeText(text).then(
      ()=>this.aviso.set('Comprovante de simulação copiado.'),
      ()=>this.erro.set('Seu navegador não permitiu copiar.'));
  }

  protected alternarPrivacidade():void{
    const next=!this.ocultarValores();
    this.ocultarValores.set(next);
    sessionStorage.setItem('banco-escola:ocultar-valores',next?'1':'0');
  }
  protected saldoFormatado(value:number):string{return this.ocultarValores()?'R$ ••••••':this.dinheiro(value);}
  protected titula():string{return this.titulos[this.view()];}
  protected abrirPrimeiraMeta():void{this.abrir('metas');}
  protected async copiarConta():Promise<void>{
    const conta=this.atual();
    if(!conta)return;
    try{
      await navigator.clipboard.writeText('Banco Escola (simulado) • Agência '+conta.agency+' • Conta '+conta.code);
      this.aviso.set('Dados da conta fictícia copiados.');
    }catch{this.erro.set('Não foi possível copiar os dados da conta.');}
  }
  protected selecionarFavorito(toId:number):void{
    this.transfer.toAccountId=toId;this.abrir('transferir');
  }
  protected async adicionarFavorito():Promise<void>{
    const target=this.transfer.toAccountId;
    if(!target){this.erro.set('Selecione uma conta destinatária.');return;}
    await this.executar(()=>this.api('/api/bank/favorites',{method:'POST',
      body:JSON.stringify({accountId:this.contaId(),toAccountId:target})}),
      'Conta fictícia adicionada aos favoritos.');
  }
  protected async removerFavorito(toId:number):Promise<void>{
    await this.executar(()=>this.api('/api/bank/favorites/'+toId+'?accountId='+this.contaId(),{
      method:'DELETE'}),'Favorito removido.');
  }
  protected async atualizarLimites():Promise<void>{
    await this.executar(()=>this.api('/api/bank/limits',{method:'PUT',
      body:JSON.stringify({accountId:this.contaId(),
        maxPerTransferCents:this.parseValor(this.limiteForm.porOperacao),
        maxDailyCents:this.parseValor(this.limiteForm.diario)})}),
      'Limites fictícios atualizados para esta conta.');
  }

}

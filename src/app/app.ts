import { Component, computed, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

interface Conta { id:number; code:string; holder:string; agency:string; balanceCents:number; entriesCount:number; createdAt:string }
type Tipo = 'entrada'|'saida';
interface Registro { id:number; accountId:number; kind:Tipo; amountCents:number; occurredOn:string; method:string; description:string; reference:string; createdAt:string; balanceAfterCents:number }
interface Resumo { accountId:number; balanceCents:number; incomeCents:number; expenseCents:number; count:number }
type Aba='painel'|'lancamento'|'extrato'|'contas';
interface Filtros { from:string; to:string; kind:string; method:string }
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
  protected filtros:Filtros={from:'',to:'',kind:'',method:''};
  protected novo:NovoRegistro={
    kind:'entrada',amount:'',occurredOn:hojeLocal(),method:'PIX simulado',description:'',reference:''
  };
  protected titular='';
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
  }
  protected async entrar():Promise<void>{
    if(!this.token()){this.erro.set('Informe o token do backend.');return;}
    this.carregando.set(true);this.erro.set('');
    try{
      await this.carregarContas();
      this.logado.set(true);
      sessionStorage.setItem('banco-escola:token',this.token());
      await this.carregarExtrato();
    }catch(e){
      this.logado.set(false);
      this.erro.set(e instanceof Error?e.message:'Não foi possível conectar ao servidor.');
    }finally{this.carregando.set(false);}
  }
  protected sair():void{
    sessionStorage.removeItem('banco-escola:token');
    this.token.set('');this.logado.set(false);
    this.contas.set([]);this.registros.set([]);this.resumo.set(null);
    this.aviso.set('');this.erro.set('');this.view.set('painel');
  }
  private async carregarContas():Promise<void>{
    const data=await this.api<{accounts:Conta[]}>('/api/bank/accounts');
    this.contas.set(data.accounts);
    if(!data.accounts.some(c=>c.id===this.contaId()))this.contaId.set(data.accounts[0]?.id??0);
  }
  protected async selecionarConta(value:number|string):Promise<void>{
    this.contaId.set(Number(value));this.limparFiltros(false);
    await this.carregarExtrato();
  }
  private query():string{
    const args=new URLSearchParams({accountId:String(this.contaId())});
    if(this.filtros.from)args.set('from',this.filtros.from);
    if(this.filtros.to)args.set('to',this.filtros.to);
    if(this.filtros.kind)args.set('kind',this.filtros.kind);
    if(this.filtros.method)args.set('method',this.filtros.method);
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
    this.filtros={from:'',to:'',kind:'',method:''};
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
        method:this.novo.method,description:this.novo.description,reference:this.novo.reference
      })});
      this.novo={kind:'entrada',amount:'',occurredOn:hojeLocal(),method:'PIX simulado',description:'',reference:''};
      this.limparFiltros(false);
      await this.carregarContas();
      await this.carregarExtrato();
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
      this.limparFiltros(false);await this.carregarExtrato();
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
}

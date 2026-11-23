import {TestBed} from '@angular/core/testing';
import {App,paraCentavos} from './app';
describe('Banco Escola Angular',()=>{
  beforeEach(async()=>{
    sessionStorage.clear();
    await TestBed.configureTestingModule({imports:[App]}).compileComponents();
  });
  it('cria o componente e mostra ambiente de demonstração',async()=>{
    const fixture=TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Banco Escola');
    expect(fixture.nativeElement.textContent).toContain('SEM DINHEIRO REAL');
  });

  it('mostra a conferência de Pix fictício com saldo previsto antes de registrar',async()=>{
    const fixture=TestBed.createComponent(App);
    const app=fixture.componentInstance as any;
    app.contas.set([
      {id:1,holder:'Conta Demonstração A',code:'SIM-00001',agency:'DEMO',balanceCents:150000,entriesCount:1,createdAt:'2026-11-01'},
      {id:2,holder:'Conta Demonstração B',code:'SIM-00002',agency:'DEMO',balanceCents:0,entriesCount:0,createdAt:'2026-11-01'}
    ]);
    app.contaId.set(1);app.logado.set(true);app.view.set('transferir');
    app.limites.set({maxPerTransferCents:100000,maxDailyCents:200000,remainingCents:200000,usedCents:0});
    app.transfer={toAccountId:2,amount:'55,75',method:'PIX simulado',description:'Pix de teste'};
    fixture.detectChanges();
    await fixture.whenStable();
    app.revisarTransferencia();
    fixture.detectChanges();
    expect(app.revisao()?.tipo).toBe('transferencia');
    expect(app.revisao()?.valorCentavos).toBe(5575);
    expect(app.revisao()?.saldoPrevistoCentavos).toBe(144425);
    expect(fixture.nativeElement.textContent).toContain('Confira os dados da operação');
    expect(fixture.nativeElement.textContent).toContain('Confirmar simulação');
  });
  it('recusa antecipadamente transferências superiores ao saldo e ao limite',()=>{
    const fixture=TestBed.createComponent(App);
    const app=fixture.componentInstance as any;
    app.contas.set([
      {id:1,holder:'Conta A',code:'SIM-00001',balanceCents:5000},
      {id:2,holder:'Conta B',code:'SIM-00002',balanceCents:0}
    ]);
    app.contaId.set(1);app.transfer={toAccountId:2,amount:'100,00',method:'PIX simulado',description:'Teste de valor'};
    app.revisarTransferencia();
    expect(app.revisao()).toBeNull();
    expect(app.erro()).toContain('Saldo fictício insuficiente');
    app.transfer.amount='30,00';
    app.limites.set({maxPerTransferCents:1000,maxDailyCents:1500,remainingCents:1500,usedCents:0});
    app.revisarTransferencia();
    expect(app.revisao()).toBeNull();
    expect(app.erro()).toContain('limite fictício');
  });
  it('exige conferência do favorecido e do valor do pagamento fictício',()=>{
    const fixture=TestBed.createComponent(App);
    const app=fixture.componentInstance as any;
    app.contas.set([{id:1,holder:'Conta A',code:'SIM-00001',balanceCents:50000}]);
    app.contaId.set(1);
    app.bill={payee:'Conta de energia fictícia',reference:'BOLETO-TESTE-01',amount:'39,90',dueOn:'2026-11-23'};
    app.revisarPagamento();
    expect(app.revisao()?.tipo).toBe('pagamento');
    expect(app.revisao()?.valorCentavos).toBe(3990);
    expect(app.revisao()?.saldoPrevistoCentavos).toBe(46010);
  });

  it('converte valores para centavos sem arredondamento',()=>{
    expect(paraCentavos('150,75')).toBe(15075);
    expect(paraCentavos('0,01')).toBe(1);
    expect(paraCentavos('12.3')).toBe(1230);
    expect(paraCentavos('-10')).toBeNull();
    expect(paraCentavos('5,555')).toBeNull();
  });
});

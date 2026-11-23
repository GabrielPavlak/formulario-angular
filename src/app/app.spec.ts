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
  it('converte valores para centavos sem arredondamento',()=>{
    expect(paraCentavos('150,75')).toBe(15075);
    expect(paraCentavos('0,01')).toBe(1);
    expect(paraCentavos('12.3')).toBe(1230);
    expect(paraCentavos('-10')).toBeNull();
    expect(paraCentavos('5,555')).toBeNull();
  });
});

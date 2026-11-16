import { TestBed } from '@angular/core/testing';
import { App } from './app';
describe('App', () => {
  beforeEach(async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, headers: new Headers({ 'content-type': 'application/json' }), json: async () => ({ titulo: 'Pesquisa', descricao: 'Teste', perguntas: [] }) }));
    sessionStorage.clear();
    await TestBed.configureTestingModule({ imports: [App] }).compileComponents();
  });
  afterEach(() => vi.unstubAllGlobals());
  it('cria componente e exibe pesquisa', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Pesquisa');
  });
});
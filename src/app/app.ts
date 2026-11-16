import { Component, computed, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

type TipoPergunta = 'texto' | 'paragrafo' | 'multipla' | 'caixas' | 'lista';
interface Pergunta { id: string; titulo: string; tipo: TipoPergunta; obrigatoria: boolean; opcoes: string[] }
interface Formulario { titulo: string; descricao: string; perguntas: Pergunta[] }
interface Resposta { id: number; data: string; valores: Record<string, string | string[]> }
type Aba = 'editar' | 'preencher' | 'respostas';
const TIPOS: { valor: TipoPergunta; rotulo: string }[] = [
  { valor: 'texto', rotulo: 'Resposta curta' }, { valor: 'paragrafo', rotulo: 'Parágrafo' },
  { valor: 'multipla', rotulo: 'Múltipla escolha' }, { valor: 'caixas', rotulo: 'Caixas de seleção' },
  { valor: 'lista', rotulo: 'Lista suspensa' }
];
function idNovo(): string { return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2); }
function mensagemErro(e: unknown): string { return e instanceof Error ? e.message : 'Erro inesperado'; }

@Component({ selector: 'app-root', imports: [FormsModule], templateUrl: './app.html', styleUrl: './app.css' })
export class App implements OnInit {
  protected readonly aba = signal<Aba>('preencher');
  protected readonly form = signal<Formulario>({ titulo: 'Carregando pesquisa...', descricao: '', perguntas: [] });
  protected readonly respostas = signal<Resposta[]>([]);
  protected readonly token = signal(sessionStorage.getItem('forms:admin-token') ?? '');
  protected readonly autenticado = signal(false);
  protected readonly carregando = signal(true);
  protected readonly salvando = signal(false);
  protected readonly enviando = signal(false);
  protected readonly enviado = signal(false);
  protected readonly mensagem = signal('');
  protected readonly focada = signal<string | null>(null);
  protected readonly tipos = TIPOS;
  protected readonly totalRespostas = computed(() => this.respostas().length);
  protected valores: Record<string, string | string[]> = {};
  protected erros = new Set<string>();
  private salvarTimer: ReturnType<typeof setTimeout> | undefined;

  async ngOnInit(): Promise<void> {
    const param = new URLSearchParams(location.search);
    if (param.get('admin') === '1') this.aba.set('editar');
    await this.carregarFormulario();
    if (this.token()) await this.entrar();
  }

  private async requisicao<T>(url: string, init: RequestInit = {}, admin = false): Promise<T> {
    const cabecalhos: Record<string, string> = { 'Content-Type': 'application/json' };
    if (admin) cabecalhos['Authorization'] = 'Bearer ' + this.token();
    const resposta = await fetch(url, { ...init, headers: { ...cabecalhos, ...(init.headers ?? {}) } });
    const tipo = resposta.headers.get('content-type') ?? '';
    const corpo = tipo.includes('application/json') ? await resposta.json() : null;
    if (!resposta.ok) throw new Error(corpo?.error ?? 'Falha HTTP ' + resposta.status);
    return corpo as T;
  }

  private async carregarFormulario(): Promise<void> {
    try {
      const dados = await this.requisicao<Formulario>('/api/form');
      this.form.set(dados);
      this.limparPreenchimento();
      this.mensagem.set('');
    } catch (e) { this.mensagem.set('Não foi possível conectar ao servidor: ' + mensagemErro(e)); }
    finally { this.carregando.set(false); }
  }

  protected async entrar(): Promise<void> {
    if (!this.token()) { this.mensagem.set('Digite o token administrativo.'); return; }
    try {
      const dados = await this.requisicao<{ respostas: Resposta[] }>('/api/responses', {}, true);
      sessionStorage.setItem('forms:admin-token', this.token());
      this.respostas.set(dados.respostas);
      this.autenticado.set(true);
      this.mensagem.set('');
    } catch (e) { this.autenticado.set(false); this.mensagem.set('Acesso administrativo negado: ' + mensagemErro(e)); }
  }
  protected sair(): void {
    this.autenticado.set(false); this.token.set(''); this.respostas.set([]);
    sessionStorage.removeItem('forms:admin-token'); this.aba.set('preencher');
  }
  protected async irPara(aba: Aba): Promise<void> {
    this.aba.set(aba);
    this.mensagem.set('');
    if (aba === 'preencher') this.limparPreenchimento();
    if (aba === 'respostas' && this.autenticado()) await this.atualizarRespostas();
  }
  protected async atualizarRespostas(): Promise<void> {
    try { const r = await this.requisicao<{ respostas: Resposta[] }>('/api/responses', {}, true); this.respostas.set(r.respostas); }
    catch (e) { this.mensagem.set(mensagemErro(e)); }
  }

  protected atualizarCabecalho(campo: 'titulo' | 'descricao', valor: string): void { this.form.update(f => ({ ...f, [campo]: valor })); this.agendarSalvar(); }
  protected adicionarPergunta(): void {
    const id = idNovo();
    this.form.update(f => ({ ...f, perguntas: [...f.perguntas, { id, titulo: 'Nova pergunta', tipo: 'multipla', obrigatoria: false, opcoes: ['Opção 1', 'Opção 2'] }] }));
    this.focada.set(id); this.agendarSalvar();
  }
  protected removerPergunta(id: string): void { this.form.update(f => ({ ...f, perguntas: f.perguntas.filter(p => p.id !== id) })); this.agendarSalvar(); }
  protected duplicarPergunta(id: string): void {
    this.form.update(f => { const i = f.perguntas.findIndex(p => p.id === id); if (i < 0) return f;
      const p = f.perguntas[i], perguntas = [...f.perguntas];
      perguntas.splice(i + 1, 0, { ...p, id: idNovo(), opcoes: [...p.opcoes] }); return { ...f, perguntas };
    }); this.agendarSalvar();
  }
  protected mover(id: string, direcao: -1 | 1): void {
    this.form.update(f => { const i = f.perguntas.findIndex(p => p.id === id), j = i + direcao;
      if (i < 0 || j < 0 || j >= f.perguntas.length) return f;
      const perguntas = [...f.perguntas]; [perguntas[i], perguntas[j]] = [perguntas[j], perguntas[i]]; return { ...f, perguntas };
    }); this.agendarSalvar();
  }
  protected alterar(id: string, mudancas: Partial<Pergunta>): void {
    this.form.update(f => ({ ...f, perguntas: f.perguntas.map(p => {
      if (p.id !== id) return p; const novo = { ...p, ...mudancas };
      if (['multipla', 'caixas', 'lista'].includes(novo.tipo) && !novo.opcoes.length) novo.opcoes = ['Opção 1'];
      return novo;
    }) })); this.agendarSalvar();
  }
  protected alterarOpcao(id: string, indice: number, texto: string): void {
    const p = this.form().perguntas.find(p => p.id === id); if (!p) return;
    const opcoes = [...p.opcoes]; opcoes[indice] = texto; this.alterar(id, { opcoes });
  }
  protected adicionarOpcao(id: string): void {
    const p = this.form().perguntas.find(p => p.id === id); if (p) this.alterar(id, { opcoes: [...p.opcoes, 'Opção ' + (p.opcoes.length + 1)] });
  }
  protected removerOpcao(id: string, indice: number): void {
    const p = this.form().perguntas.find(p => p.id === id);
    if (p && p.opcoes.length > 1) this.alterar(id, { opcoes: p.opcoes.filter((_, i) => i !== indice) });
  }
  private agendarSalvar(): void { if (this.salvarTimer) clearTimeout(this.salvarTimer); this.salvarTimer = setTimeout(() => void this.salvar(), 900); }
  protected async salvar(): Promise<void> {
    if (!this.autenticado()) return;
    if (this.salvarTimer) clearTimeout(this.salvarTimer);
    this.salvando.set(true);
    try { await this.requisicao('/api/form', { method: 'PUT', body: JSON.stringify(this.form()) }, true); this.mensagem.set('Formulário salvo no banco de dados.'); }
    catch (e) { this.mensagem.set('Não foi possível salvar: ' + mensagemErro(e)); }
    finally { this.salvando.set(false); }
  }

  private limparPreenchimento(): void {
    this.valores = {}; this.erros = new Set(); this.enviado.set(false);
    for (const p of this.form().perguntas) this.valores[p.id] = p.tipo === 'caixas' ? [] : '';
  }
  protected caixaMarcada(id: string, opcao: string): boolean { return ((this.valores[id] as string[]) ?? []).includes(opcao); }
  protected alternarCaixa(id: string, opcao: string, marcado: boolean): void {
    const atual = (this.valores[id] as string[]) ?? [];
    this.valores[id] = marcado ? [...atual.filter(o => o !== opcao), opcao] : atual.filter(o => o !== opcao);
  }
  protected async enviar(): Promise<void> {
    const erros = new Set<string>();
    for (const p of this.form().perguntas) {
      const v = this.valores[p.id];
      if (p.obrigatoria && (Array.isArray(v) ? v.length === 0 : !String(v ?? '').trim())) erros.add(p.id);
    }
    this.erros = erros; if (erros.size) { this.mensagem.set('Preencha as perguntas obrigatórias.'); return; }
    this.enviando.set(true); this.mensagem.set('');
    try {
      await this.requisicao('/api/responses', { method: 'POST', body: JSON.stringify({ valores: this.valores }) });
      this.enviado.set(true);
      if (this.autenticado()) await this.atualizarRespostas();
    } catch (e) { this.mensagem.set('Erro ao enviar: ' + mensagemErro(e)); }
    finally { this.enviando.set(false); }
  }
  protected outraResposta(): void { this.limparPreenchimento(); this.mensagem.set(''); }
  protected formatar(v: string | string[] | undefined): string { return Array.isArray(v) ? v.join(', ') : (v ?? ''); }
  protected formatarData(s: string): string { return new Date(s).toLocaleString('pt-BR'); }
  protected async exportarCsv(): Promise<void> {
    try {
      const r = await fetch('/api/responses.csv', { headers: { Authorization: 'Bearer ' + this.token() } });
      if (!r.ok) throw new Error('Falha ao exportar');
      const url = URL.createObjectURL(await r.blob()); const link = document.createElement('a');
      link.href = url; link.download = 'respostas-pesquisa.csv'; link.click(); URL.revokeObjectURL(url);
    } catch (e) { this.mensagem.set(mensagemErro(e)); }
  }
  protected async apagarRespostas(): Promise<void> {
    if (!confirm('Excluir permanentemente todas as respostas?')) return;
    try { await this.requisicao('/api/responses', { method: 'DELETE' }, true); this.respostas.set([]); this.mensagem.set('Respostas apagadas.'); }
    catch (e) { this.mensagem.set(mensagemErro(e)); }
  }
}

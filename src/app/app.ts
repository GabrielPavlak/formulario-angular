import { Component, computed, effect, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

export type TipoPergunta = 'texto' | 'paragrafo' | 'multipla' | 'caixas' | 'lista';

export interface Pergunta {
  id: string;
  titulo: string;
  tipo: TipoPergunta;
  obrigatoria: boolean;
  opcoes: string[];
}

export interface Formulario {
  titulo: string;
  descricao: string;
  perguntas: Pergunta[];
}

export interface Resposta {
  data: string;
  valores: Record<string, string | string[]>;
}

type Aba = 'editar' | 'preencher' | 'respostas';

const CHAVE_FORM = 'meu-forms:formulario';
const CHAVE_RESP = 'meu-forms:respostas';

const tiposComOpcoes: TipoPergunta[] = ['multipla', 'caixas', 'lista'];

function novoId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function formularioInicial(): Formulario {
  return {
    titulo: 'Formulário sem título',
    descricao: 'Descrição do formulário',
    perguntas: [
      {
        id: novoId(),
        titulo: 'Qual é o seu nome?',
        tipo: 'texto',
        obrigatoria: true,
        opcoes: [],
      },
      {
        id: novoId(),
        titulo: 'Qual linguagem você mais gosta de usar?',
        tipo: 'multipla',
        obrigatoria: false,
        opcoes: ['TypeScript', 'Python', 'C', 'Java'],
      },
    ],
  };
}

function carregar<T>(chave: string, padrao: T): T {
  try {
    const bruto = localStorage.getItem(chave);
    return bruto ? (JSON.parse(bruto) as T) : padrao;
  } catch {
    return padrao;
  }
}

@Component({
  selector: 'app-root',
  imports: [FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly aba = signal<Aba>('editar');
  protected readonly focada = signal<string | null>(null);
  protected readonly form = signal<Formulario>(carregar(CHAVE_FORM, formularioInicial()));
  protected readonly respostas = signal<Resposta[]>(carregar(CHAVE_RESP, []));

  // valores do preenchimento atual (aba "preencher")
  protected valores: Record<string, string | string[]> = {};
  protected erros = new Set<string>();
  protected enviado = signal(false);

  protected readonly tipos: { valor: TipoPergunta; rotulo: string }[] = [
    { valor: 'texto', rotulo: 'Resposta curta' },
    { valor: 'paragrafo', rotulo: 'Parágrafo' },
    { valor: 'multipla', rotulo: 'Múltipla escolha' },
    { valor: 'caixas', rotulo: 'Caixas de seleção' },
    { valor: 'lista', rotulo: 'Lista suspensa' },
  ];

  protected readonly totalRespostas = computed(() => this.respostas().length);

  constructor() {
    effect(() => {
      try {
        localStorage.setItem(CHAVE_FORM, JSON.stringify(this.form()));
      } catch {
        /* sem armazenamento disponível, segue sem salvar */
      }
    });
    effect(() => {
      try {
        localStorage.setItem(CHAVE_RESP, JSON.stringify(this.respostas()));
      } catch {
        /* idem */
      }
    });
  }

  protected temOpcoes(tipo: TipoPergunta): boolean {
    return tiposComOpcoes.includes(tipo);
  }

  protected irPara(aba: Aba): void {
    this.aba.set(aba);
    if (aba === 'preencher') {
      this.limparPreenchimento();
    }
  }

  // ---------- edição ----------

  protected atualizarCabecalho(campo: 'titulo' | 'descricao', valor: string): void {
    this.form.update((f) => ({ ...f, [campo]: valor }));
  }

  protected adicionarPergunta(): void {
    const id = novoId();
    this.form.update((f) => ({
      ...f,
      perguntas: [
        ...f.perguntas,
        { id, titulo: '', tipo: 'multipla', obrigatoria: false, opcoes: ['Opção 1'] },
      ],
    }));
    this.focada.set(id);
  }

  protected removerPergunta(id: string): void {
    this.form.update((f) => ({ ...f, perguntas: f.perguntas.filter((p) => p.id !== id) }));
  }

  protected duplicarPergunta(id: string): void {
    this.form.update((f) => {
      const i = f.perguntas.findIndex((p) => p.id === id);
      if (i < 0) return f;
      const copia: Pergunta = {
        ...f.perguntas[i],
        id: novoId(),
        opcoes: [...f.perguntas[i].opcoes],
      };
      const lista = [...f.perguntas];
      lista.splice(i + 1, 0, copia);
      return { ...f, perguntas: lista };
    });
  }

  protected mover(id: string, direcao: -1 | 1): void {
    this.form.update((f) => {
      const i = f.perguntas.findIndex((p) => p.id === id);
      const j = i + direcao;
      if (i < 0 || j < 0 || j >= f.perguntas.length) return f;
      const lista = [...f.perguntas];
      [lista[i], lista[j]] = [lista[j], lista[i]];
      return { ...f, perguntas: lista };
    });
  }

  protected alterar(id: string, mudancas: Partial<Pergunta>): void {
    this.form.update((f) => ({
      ...f,
      perguntas: f.perguntas.map((p) => {
        if (p.id !== id) return p;
        const nova = { ...p, ...mudancas };
        // ao trocar para um tipo com opções, garante pelo menos uma opção
        if (this.temOpcoes(nova.tipo) && nova.opcoes.length === 0) {
          nova.opcoes = ['Opção 1'];
        }
        return nova;
      }),
    }));
  }

  protected alterarOpcao(id: string, indice: number, texto: string): void {
    const p = this.form().perguntas.find((x) => x.id === id);
    if (!p) return;
    const opcoes = [...p.opcoes];
    opcoes[indice] = texto;
    this.alterar(id, { opcoes });
  }

  protected adicionarOpcao(id: string): void {
    const p = this.form().perguntas.find((x) => x.id === id);
    if (!p) return;
    this.alterar(id, { opcoes: [...p.opcoes, `Opção ${p.opcoes.length + 1}`] });
  }

  protected removerOpcao(id: string, indice: number): void {
    const p = this.form().perguntas.find((x) => x.id === id);
    if (!p || p.opcoes.length <= 1) return;
    this.alterar(id, { opcoes: p.opcoes.filter((_, i) => i !== indice) });
  }

  protected trackPorIndice(indice: number): number {
    return indice;
  }

  // ---------- preenchimento ----------

  private limparPreenchimento(): void {
    this.valores = {};
    this.erros = new Set();
    this.enviado.set(false);
    for (const p of this.form().perguntas) {
      this.valores[p.id] = p.tipo === 'caixas' ? [] : '';
    }
  }

  protected alternarCaixa(id: string, opcao: string, marcado: boolean): void {
    const atual = (this.valores[id] as string[]) ?? [];
    this.valores[id] = marcado ? [...atual, opcao] : atual.filter((o) => o !== opcao);
  }

  protected caixaMarcada(id: string, opcao: string): boolean {
    return ((this.valores[id] as string[]) ?? []).includes(opcao);
  }

  protected enviar(): void {
    const erros = new Set<string>();
    for (const p of this.form().perguntas) {
      const v = this.valores[p.id];
      const vazio = Array.isArray(v) ? v.length === 0 : !v || !String(v).trim();
      if (p.obrigatoria && vazio) erros.add(p.id);
    }
    this.erros = erros;
    if (erros.size > 0) return;

    const nova: Resposta = {
      data: new Date().toISOString(),
      valores: { ...this.valores },
    };
    this.respostas.update((r) => [...r, nova]);
    this.enviado.set(true);
  }

  protected outraResposta(): void {
    this.limparPreenchimento();
  }

  // ---------- respostas ----------

  protected formatar(v: string | string[] | undefined): string {
    if (v === undefined) return '';
    return Array.isArray(v) ? v.join(', ') : v;
  }

  protected formatarData(iso: string): string {
    return new Date(iso).toLocaleString('pt-BR');
  }

  protected apagarRespostas(): void {
    if (confirm('Apagar todas as respostas salvas?')) {
      this.respostas.set([]);
    }
  }

  protected exportarCsv(): void {
    const perguntas = this.form().perguntas;
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const linhas = [
      ['Data', ...perguntas.map((p) => p.titulo || '(sem título)')].map(esc).join(';'),
      ...this.respostas().map((r) =>
        [this.formatarData(r.data), ...perguntas.map((p) => this.formatar(r.valores[p.id]))]
          .map(esc)
          .join(';'),
      ),
    ];
    this.baixar('respostas.csv', '﻿' + linhas.join('\n'), 'text/csv;charset=utf-8');
  }

  protected exportarJson(): void {
    this.baixar('formulario.json', JSON.stringify(this.form(), null, 2), 'application/json');
  }

  protected importarJson(evento: Event): void {
    const input = evento.target as HTMLInputElement;
    const arquivo = input.files?.[0];
    if (!arquivo) return;
    arquivo.text().then((texto) => {
      try {
        const dados = JSON.parse(texto) as Formulario;
        if (!dados || !Array.isArray(dados.perguntas)) throw new Error('formato inválido');
        this.form.set({
          titulo: String(dados.titulo ?? ''),
          descricao: String(dados.descricao ?? ''),
          perguntas: dados.perguntas.map((p) => ({
            id: novoId(),
            titulo: String(p.titulo ?? ''),
            tipo: p.tipo,
            obrigatoria: !!p.obrigatoria,
            opcoes: Array.isArray(p.opcoes) ? p.opcoes.map(String) : [],
          })),
        });
        this.respostas.set([]);
      } catch {
        alert('Não foi possível ler esse arquivo. Use um JSON exportado por este app.');
      }
      input.value = '';
    });
  }

  private baixar(nome: string, conteudo: string, tipo: string): void {
    const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
    const a = document.createElement('a');
    a.href = url;
    a.download = nome;
    a.click();
    URL.revokeObjectURL(url);
  }
}

/* =====================================================================
   NÚCLEO DE BALANCEAMENTO — copiado do team-balance (index.html), apenas
   tipado. Roda no navegador (Web Worker, ver balance.worker.ts) para não
   gerar carga no servidor. Trabalha sempre com notas inteiras em "cents"
   (nota * 100).
   ===================================================================== */

export interface Estrutura {
  base: number[]; // total inicial (nota do suplente pré-alocado, em cents)
  cap: number[]; // quantos jogadores REAIS o time j comporta
  subs: number[]; // quantos suplentes o time j recebe (0 ou 1)
}

export interface Candidato {
  base: number[];
  cap: number[];
}

export interface Resultado {
  assign: number[];
  provado: boolean;
  idx: number;
  spread: number;
}

export function estrutura_times(
  n: number,
  k: number,
  iguais: boolean,
  comSuplentes: boolean,
  mediaC: number
): Estrutura {
  // Correção: cada vaga vira 1 suplente em 1 time distinto (nunca 2 no mesmo).
  if (!iguais) {
    return { base: new Array(k).fill(0), cap: new Array(k).fill(n), subs: new Array(k).fill(0) };
  }
  const m = Math.ceil(n / k);
  const r = n % k;
  if (r === 0) {
    return { base: new Array(k).fill(0), cap: new Array(k).fill(m), subs: new Array(k).fill(0) };
  }
  const vagas = k - r; // times que ficariam com 1 a menos
  let base: number[], cap: number[], subs: number[];
  if (comSuplentes) {
    base = new Array(vagas).fill(mediaC).concat(new Array(r).fill(0));
    cap = new Array(vagas).fill(m - 1).concat(new Array(r).fill(m));
    subs = new Array(vagas).fill(1).concat(new Array(r).fill(0));
  } else {
    base = new Array(k).fill(0);
    cap = new Array(vagas).fill(m - 1).concat(new Array(r).fill(m));
    subs = new Array(k).fill(0);
  }
  return { base, cap, subs };
}

/* ---------------------------------------------------------------------
   PANELINHA — casamento das capacidades com os times do preview.

   Quando n não divide por k, estrutura_times devolve capacidades DESIGUAIS
   (uns times comportam m-1 reais + 1 suplente, outros m reais). Sem
   panelinha os times são intercambiáveis e essa ordem é irrelevante; com
   jogadores presos ela passa a importar, porque decide quem fica com a
   vaga curta — e isso muda bastante o equilíbrio final.

   Por isso não escolhemos a ordem "no chute": enumeramos as combinações
   DISTINTAS e deixamos o solver comparar (ver solveSync). Slots do mesmo
   tipo e times com a mesma "carga" (soma e quantidade de presos) são
   intercambiáveis, então a lista costuma ter 1 item — exatamente o
   comportamento antigo quando não há panelinha ou quando n divide por k.
   --------------------------------------------------------------------- */

// Viabilidade: ordenar presos e capacidades e parear (se essa combinação não
// couber, nenhuma outra cabe). Usado pela interface para liberar o "+".
export function cabeNasVagas(counts: number[], caps: number[]): boolean {
  const a = counts.slice().sort((x, y) => x - y);
  const b = caps.slice().sort((x, y) => x - y);
  for (let i = 0; i < a.length; i++) if (a[i] > b[i]) return false;
  return true;
}

// counts[j]/sums[j] = quantidade e soma das notas presas no time j.
// Retorna [{base, cap, subs}] já na numeração do preview, só com as viáveis.
//
// A enumeração é feita por GRUPOS de times intercambiáveis (mesma soma e mesma
// quantidade de presos), não time a time: escolher "quais dos 20 times ficam com
// a vaga curta" daria C(20,10) combinações, quase todas idênticas entre si.
// Assim, sem panelinha há 1 grupo e 1 candidato — o comportamento de sempre.
export function candidatosPanelinha(est: Estrutura, counts: number[], sums: number[]): Estrutura[] {
  const k = est.cap.length;
  const LIMITE = 60; // trava contra explosão combinatória

  // tipos distintos de slot (tipicamente 2: "m-1 + suplente" e "m")
  const tipos: { sig: string; base: number; cap: number; subs: number; qtd: number }[] = [];
  for (let i = 0; i < k; i++) {
    const sig = est.base[i] + ":" + est.cap[i] + ":" + est.subs[i];
    let t = tipos.find((x) => x.sig === sig) ?? null;
    if (!t) {
      t = { sig, base: est.base[i], cap: est.cap[i], subs: est.subs[i], qtd: 0 };
      tipos.push(t);
    }
    t.qtd++;
  }

  // grupos de times equivalentes
  const grupos: { sig: string; membros: number[]; presos: number }[] = [];
  for (let j = 0; j < k; j++) {
    const sig = sums[j] + "/" + counts[j];
    let g = grupos.find((x) => x.sig === sig) ?? null;
    if (!g) {
      g = { sig, membros: [], presos: counts[j] };
      grupos.push(g);
    }
    g.membros.push(j);
  }

  const out: Estrutura[] = [];
  const escolha = grupos.map(() => new Array(tipos.length).fill(0));
  const restam = tipos.map((t) => t.qtd);

  function materializar() {
    const base = new Array(k),
      cap = new Array(k),
      subs = new Array(k);
    for (let g = 0; g < grupos.length; g++) {
      const membros = grupos[g].membros;
      let p = 0;
      for (let t = 0; t < tipos.length; t++) {
        for (let q = 0; q < escolha[g][t]; q++) {
          const j = membros[p++];
          base[j] = tipos[t].base;
          cap[j] = tipos[t].cap;
          subs[j] = tipos[t].subs;
        }
      }
    }
    out.push({ base, cap, subs });
  }

  // distribui os slots entre os grupos; um grupo só aceita um tipo em que os
  // presos caibam, então as combinações inviáveis nem chegam a ser geradas
  (function porGrupo(g: number) {
    if (out.length >= LIMITE) return;
    if (g === grupos.length) {
      materializar();
      return;
    }
    const total = grupos[g].membros.length;
    (function porTipo(t: number, faltam: number) {
      if (out.length >= LIMITE) return;
      const cabe = grupos[g].presos <= tipos[t].cap;
      if (t === tipos.length - 1) {
        if (!cabe && faltam > 0) return;
        if (faltam > restam[t]) return;
        restam[t] -= faltam;
        escolha[g][t] = faltam;
        porGrupo(g + 1);
        escolha[g][t] = 0;
        restam[t] += faltam;
        return;
      }
      const max = cabe ? Math.min(faltam, restam[t]) : 0;
      for (let q = 0; q <= max; q++) {
        restam[t] -= q;
        escolha[g][t] = q;
        porTipo(t + 1, faltam - q);
        escolha[g][t] = 0;
        restam[t] += q;
      }
    })(0, total);
  })(0);

  return out;
}

export function resolver_guloso(scores: number[], base: number[], cap: number[]): number[] {
  const k = base.length;
  const assign = new Array(scores.length).fill(0);
  const totais = base.slice();
  const counts = new Array(k).fill(0);
  for (let i = 0; i < scores.length; i++) {
    const s = scores[i];
    let melhor: number | null = null;
    for (let j = 0; j < k; j++) {
      if (counts[j] >= cap[j]) continue;
      if (
        melhor === null ||
        totais[j] < totais[melhor] ||
        (totais[j] === totais[melhor] && counts[j] < counts[melhor])
      )
        melhor = j;
    }
    assign[i] = melhor;
    totais[melhor!] += s;
    counts[melhor!] += 1;
  }
  return assign;
}

export function calc_spread(assign: number[], scores: number[], base: number[]): number {
  const totais = base.slice();
  for (let i = 0; i < assign.length; i++) totais[assign[i]] += scores[i];
  let mx = -Infinity,
    mn = Infinity;
  for (const t of totais) {
    if (t > mx) mx = t;
    if (t < mn) mn = t;
  }
  return mx - mn;
}

export function melhorar_local(assign: number[], scores: number[], base: number[]): number[] {
  assign = assign.slice();
  const n = scores.length;
  const totais = base.slice();
  for (let i = 0; i < n; i++) totais[assign[i]] += scores[i];
  let melhorou = true;
  while (melhorou) {
    melhorou = false;
    let spread_atual = Math.max(...totais) - Math.min(...totais);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = assign[i],
          b = assign[j];
        if (a === b) continue;
        const delta = scores[j] - scores[i]; // a ganha delta, b perde delta
        const na = totais[a] + delta;
        const nb = totais[b] - delta;
        const novos = totais.slice();
        novos[a] = na;
        novos[b] = nb;
        const ns = Math.max(...novos) - Math.min(...novos);
        if (ns < spread_atual) {
          assign[i] = b;
          assign[j] = a;
          totais[a] = na;
          totais[b] = nb;
          spread_atual = ns;
          melhorou = true;
        }
      }
    }
  }
  return assign;
}

export function resolver_otimo(
  scores: number[],
  base: number[],
  cap: number[],
  incumbente: number[] | null,
  limite_seg = 10.0
): { assign: number[]; provado: boolean } {
  const n = scores.length;
  const k = base.length;
  let S = 0;
  for (const s of scores) S += s;
  for (const b of base) S += b; // total inclui os suplentes pré-alocados

  const teto = Math.ceil(S / k);
  const piso = Math.floor(S / k);
  const lb = teto - piso;

  if (incumbente == null) incumbente = resolver_guloso(scores, base, cap);
  incumbente = melhorar_local(incumbente, scores, base);
  const melhor_assign = incumbente.slice();
  const melhor_spread = calc_spread(incumbente, scores, base);
  if (melhor_spread <= lb) return { assign: melhor_assign, provado: true };

  const prefix = new Array(n + 1).fill(0);
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + scores[i];

  const agora = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
  const inicio = agora();
  let contador = 0;
  const TIMEOUT = {};

  function busca(L: number, U: number): number[] | null {
    const assign = new Array(n).fill(-1);
    const totais = base.slice();
    const counts = new Array(k).fill(0);
    const achado: { assign: number[] | null } = { assign: null };

    function dfs(idx: number): boolean {
      contador++;
      if (contador % 8192 === 0 && agora() - inicio > limite_seg * 1000) throw TIMEOUT;

      if (idx === n) {
        let mn = Infinity;
        for (const t of totais) if (t < mn) mn = t;
        if (mn >= L) {
          achado.assign = assign.slice();
          return true;
        }
        return false;
      }

      const rem = n - idx;
      // Poda de alcance
      for (let j = 0; j < k; j++) {
        let slots = cap[j] - counts[j];
        if (slots > rem) slots = rem;
        const max_add = prefix[idx + slots] - prefix[idx];
        if (totais[j] + max_add < L) return false;
      }

      const s = scores[idx];
      const vistos = new Set<string>();
      const order: number[] = [];
      for (let t = 0; t < k; t++) order.push(t);
      order.sort((a, b) => totais[a] - totais[b] || counts[a] - counts[b]);

      for (const j of order) {
        if (counts[j] >= cap[j]) continue;
        if (totais[j] + s > U) continue;
        // simetria: times equivalentes (mesmo total, tamanho e capacidade)
        const chave = totais[j] + "," + counts[j] + "," + cap[j];
        if (vistos.has(chave)) continue;
        vistos.add(chave);

        assign[idx] = j;
        totais[j] += s;
        counts[j] += 1;
        if (dfs(idx + 1)) return true;
        totais[j] -= s;
        counts[j] -= 1;
        assign[idx] = -1;
      }
      return false;
    }
    return dfs(0) ? achado.assign : null;
  }

  try {
    for (let d = lb; d < melhor_spread; d++) {
      for (let L = teto - d; L <= piso; L++) {
        const achou = busca(L, L + d);
        if (achou !== null) return { assign: achou, provado: true };
      }
    }
    return { assign: melhor_assign, provado: true };
  } catch (e) {
    if (e === TIMEOUT) return { assign: melhor_assign, provado: false };
    throw e;
  }
}

/* ---- Resolve de forma síncrona (usado no fallback e dentro do worker) ----
   'candidatos' é a lista de arranjos {base, cap} possíveis (ver
   candidatosPanelinha). Sem panelinha ela tem 1 item e tudo se comporta como
   antes. Retorna também 'idx': qual arranjo venceu.                        */
export function solveSync(
  scores: number[],
  candidatos: Candidato[],
  algoritmo: "otimo" | "heuristico"
): Resultado {
  const k = candidatos[0].base.length;

  // Limite inferior teórico do spread. É o mesmo para todos os candidatos:
  // eles só permutam as mesmas bases entre os times, então a soma não muda.
  let S = 0;
  for (const s of scores) S += s;
  for (const b of candidatos[0].base) S += b;
  const lb = Math.ceil(S / k) - Math.floor(S / k);

  if (algoritmo === "heuristico") {
    let melhor: Resultado | null = null;
    for (let i = 0; i < candidatos.length; i++) {
      const c = candidatos[i];
      const assign = resolver_guloso(scores, c.base, c.cap);
      const spread = calc_spread(assign, scores, c.base);
      if (melhor === null || spread < melhor.spread) {
        melhor = { assign, provado: true, idx: i, spread };
      }
      if (melhor.spread <= lb) break;
    }
    return melhor!;
  }

  // Ótimo: ranqueia os arranjos pelo guloso melhorado (barato) e só refina os
  // melhores, dividindo o orçamento de tempo entre eles.
  const ranking = candidatos
    .map((c, i) => {
      const assign = melhorar_local(resolver_guloso(scores, c.base, c.cap), scores, c.base);
      return { i, assign, spread: calc_spread(assign, scores, c.base) };
    })
    .sort((x, y) => x.spread - y.spread || x.i - y.i);

  const topo = Math.min(ranking.length, 4);
  const orcamento = Math.max(2.5, 10.0 / topo);
  let melhor: Resultado | null = null;
  let todosProvados = true;

  for (let t = 0; t < topo; t++) {
    const r = ranking[t];
    const c = candidatos[r.i];
    const res = resolver_otimo(scores, c.base, c.cap, r.assign, orcamento);
    const spread = calc_spread(res.assign, scores, c.base);
    if (!res.provado) todosProvados = false;
    if (melhor === null || spread < melhor.spread) {
      melhor = { assign: res.assign, provado: res.provado, idx: r.i, spread };
    }
    if (melhor.spread <= lb) return { assign: melhor.assign, provado: true, idx: melhor.idx, spread: melhor.spread };
  }

  // só é "provado" se todos os arranjos possíveis foram esgotados
  melhor!.provado = todosProvados && topo === candidatos.length;
  return melhor!;
}

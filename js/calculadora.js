(function () {
  "use strict";

  const IMPOSTO = window.IMPOSTO;
  const REGRAS = window.REGRAS;
  const HIST = window.HISTORICO.plataformas;
  const MARKETPLACES = ["mercadolivre", "shopee", "amazon", "tiktok", "temu"];
  const FRETE_INCLUSO = ["shopee", "tiktok", "temu"];

  const $ = (id) => document.getElementById(id);
  const radio = (name) => document.querySelector(`input[name="${name}"]:checked`).value;
  const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const pct = (v, casas = 1) =>
    (v * 100).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas }) + "%";

  function num(el) {
    const s = String(el.value).trim().replace(/\s|R\$|%/g, "");
    if (!s) return 0;
    // aceita "1.234,56", "1234,56" e "1234.56"
    const normal = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
    const v = parseFloat(normal);
    return Number.isFinite(v) ? v : NaN;
  }

  // ---------- Estado dos inputs ----------

  const comissaoDigitada = {
    amazon: REGRAS.amazon.comissaoPadrao,
    temu: REGRAS.temu.comissaoPadrao,
  };

  function lerEntrada() {
    const mlCat = window.ML_CATEGORIAS.find((c) => c.id === $("ml-categoria").value);
    let mlPct = mlCat.pct ?? num($("ml-custom")) / 100;
    if (radio("ml-tipo") === "premium") mlPct += window.ML_PREMIUM_ADICIONAL;
    return {
      mp: radio("marketplace"),
      modo: radio("modo"),
      custo: num($("custo")),
      frete: num($("frete")),
      margem: num($("margem")) / 100,
      outros: num($("outros")) / 100,
      extra: num($("extra")),
      mlPct,
      comissao: { amazon: comissaoDigitada.amazon, temu: comissaoDigitada.temu },
    };
  }

  // ---------- Modelo de tarifas ----------

  // Faixas de tarifa: [{min, max, pct, fixo}]
  function faixasTarifa(mp, modo, e) {
    if (modo === "historico") {
      return HIST[mp].faixas.map((f) => ({
        min: f.min,
        max: f.max ?? Infinity,
        pct: f.taxa,
        fixo: 0,
      }));
    }
    switch (mp) {
      case "mercadolivre":
        return [{ min: 0, max: Infinity, pct: e.mlPct, fixo: 0 }];
      case "amazon":
        return [{ min: 0, max: Infinity, pct: e.comissao.amazon, fixo: 0 }];
      case "temu":
        return [{ min: 0, max: Infinity, pct: e.comissao.temu, fixo: 0 }];
      default:
        return REGRAS[mp].faixas;
    }
  }

  // Faixas de frete: [{min, max, freteFixo|null}] — null usa o frete informado
  function faixasFrete(mp) {
    if (mp === "amazon") return REGRAS.amazon.faixasDBA;
    return [{ min: 0, max: Infinity, freteFixo: null }];
  }

  // Cruza as duas tabelas em faixas únicas
  function montarFaixas(mp, modo, e) {
    const t = faixasTarifa(mp, modo, e);
    const f = faixasFrete(mp);
    const cortes = [...new Set([...t, ...f].flatMap((x) => [x.min, x.max]))].sort((a, b) => a - b);
    const faixas = [];
    for (let i = 0; i < cortes.length - 1; i++) {
      const min = cortes[i], max = cortes[i + 1];
      const ft = t.find((x) => min >= x.min && min < x.max);
      const ff = f.find((x) => min >= x.min && min < x.max);
      if (ft && ff) faixas.push({ min, max, pct: ft.pct, fixo: ft.fixo, freteFixo: ff.freteFixo });
    }
    return faixas;
  }

  function faixaDoPreco(faixas, p) {
    return faixas.find((f) => p >= f.min && p < f.max) || faixas[faixas.length - 1];
  }

  // Composição do preço P:
  // P = custo + extra + frete + (pct·P + fixo) + imposto·P + outros·P + lucro
  function detalhar(faixas, e, freteInformado, p) {
    const f = faixaDoPreco(faixas, p);
    const frete = f.freteFixo ?? freteInformado;
    const tarifaPct = f.pct * p;
    const imposto = IMPOSTO * p;
    const outros = e.outros * p;
    const lucro = p - e.custo - e.extra - frete - tarifaPct - f.fixo - imposto - outros;
    return { preco: p, faixa: f, frete, tarifaPct, fixo: f.fixo, imposto, outros, lucro, margem: lucro / p };
  }

  // Resolve o menor preço que atinge a margem desejada.
  // Em cada faixa: P = (custo + extra + frete + fixo) / (1 − pct − imposto − outros − margem).
  // Se o P encontrado cair abaixo do início da faixa, o início da faixa já entrega margem ≥ alvo.
  function resolver(mp, modo, e, freteInformado) {
    const faixas = montarFaixas(mp, modo, e);
    let melhor = null;
    for (const f of faixas) {
      const den = 1 - f.pct - IMPOSTO - e.outros - e.margem;
      if (den <= 0) continue;
      const frete = f.freteFixo ?? freteInformado;
      let p = (e.custo + e.extra + frete + f.fixo) / den;
      p = Math.max(p, f.min);
      if (p < f.max && (melhor === null || p < melhor)) melhor = p;
    }
    if (melhor === null) return { erro: "Taxas, imposto, outros custos e margem somam 100% ou mais. Reduza a margem." };
    const precoCentavos = Math.ceil(melhor * 100 - 1e-6) / 100;
    return { faixas, ...detalhar(faixas, e, freteInformado, precoCentavos) };
  }

  // Preço "comercial" terminado em ,90 que mantém a margem desejada
  function arredondar(r, e, freteInformado) {
    let p = Math.floor(r.preco) + 0.9;
    if (p < r.preco - 1e-9) p += 1;
    for (let i = 0; i < 200; i++, p += 1) {
      const d = detalhar(r.faixas, e, freteInformado, p);
      if (d.margem >= e.margem - 1e-9) return d;
    }
    return null;
  }

  // ---------- Interface: utilidades ----------

  function alternar(el, aberto) {
    el.classList.toggle("aberto", aberto);
    el.inert = !aberto; // campos fechados não recebem foco nem Tab
  }

  // Anima o valor do preço entre o número antigo e o novo
  const animacoes = new WeakMap();
  function animarValor(el, alvo) {
    const anterior = animacoes.get(el);
    if (anterior) cancelAnimationFrame(anterior.raf);
    const de = anterior ? anterior.atual : alvo;
    const estado = { atual: de, raf: 0 };
    animacoes.set(el, estado);
    if (alvo == null) { el.textContent = "—"; animacoes.delete(el); return; }
    if (de == null || Math.abs(de - alvo) < 0.005 || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      estado.atual = alvo;
      el.textContent = brl.format(alvo);
      return;
    }
    const inicio = performance.now(), duracao = 380;
    const passo = (agora) => {
      const t = Math.min(1, (agora - inicio) / duracao);
      const k = 1 - Math.pow(1 - t, 3);
      estado.atual = de + (alvo - de) * k;
      el.textContent = brl.format(estado.atual);
      if (t < 1) estado.raf = requestAnimationFrame(passo);
    };
    estado.raf = requestAnimationFrame(passo);
  }

  function trocarTexto(el, texto) {
    if (el.textContent === texto) return;
    if (document.body.classList.contains("carregando")) { el.textContent = texto; return; }
    el.classList.add("troca");
    setTimeout(() => { el.textContent = texto; el.classList.remove("troca"); }, 160);
  }

  // ---------- Renderização ----------

  function item(rotulo, valor, sub = "", classe = "") {
    return `<div class="${classe}"><dt>${rotulo}</dt><dd>${valor}${sub ? `<small>${sub}</small>` : ""}</dd></div>`;
  }

  function renderDetalhe(r, e) {
    const tarifa = r.tarifaPct + r.fixo;
    const tarifaSub = r.fixo > 0 ? `${pct(r.faixa.pct)} + ${brl.format(r.fixo)}` : pct(r.faixa.pct);
    $("detalhe").innerHTML = [
      item("Custo do produto", brl.format(e.custo)),
      e.extra ? item("Custo extra por unidade", brl.format(e.extra)) : "",
      item("Frete", brl.format(r.frete), r.faixa.freteFixo != null ? "tarifa DBA fixa" : ""),
      item("Tarifa do marketplace", brl.format(tarifa), tarifaSub),
      item("Imposto", brl.format(r.imposto), pct(IMPOSTO, 0)),
      r.outros ? item("Outros custos", brl.format(r.outros), pct(e.outros)) : "",
      item("Lucro líquido", brl.format(r.lucro), `${pct(r.margem)} da venda`, "total"),
    ].join("");
  }

  function limparResultado(msgErro) {
    animarValor($("preco"), null);
    $("barra-preco-valor").textContent = "—";
    $("preco-arred").textContent = msgErro ? "" : "Informe o custo do produto para calcular.";
    $("detalhe").innerHTML = "";
    $("outro-modo").textContent = "";
    $("erro").hidden = !msgErro;
    $("erro").textContent = msgErro || "";
  }

  function calcular() {
    const e = lerEntrada();
    const invalido = [e.custo, e.frete, e.margem, e.outros, e.extra, e.mlPct].some((v) => Number.isNaN(v));

    if (invalido) { limparResultado("Verifique os valores digitados (use apenas números)."); renderComparativo(null); return; }
    if (e.custo <= 0) { limparResultado(""); renderComparativo(null); return; }

    const r = resolver(e.mp, e.modo, e, e.frete);
    if (r.erro) { limparResultado(r.erro); renderComparativo(e); return; }
    $("erro").hidden = true;

    animarValor($("preco"), r.preco);
    $("barra-preco-valor").textContent = brl.format(r.preco);

    const a = arredondar(r, e, e.frete);
    $("preco-arred").innerHTML = a && Math.abs(a.preco - r.preco) >= 0.005
      ? `Preço comercial <strong>${brl.format(a.preco)}</strong> · lucro ${brl.format(a.lucro)} (${pct(a.margem)})`
      : "";
    renderDetalhe(r, e);

    const outroModo = e.modo === "oficial" ? "historico" : "oficial";
    const r2 = resolver(e.mp, outroModo, e, e.frete);
    $("outro-modo").textContent = r2.erro
      ? ""
      : `${outroModo === "historico" ? "Pelo nosso histórico de taxas" : "Pela tabela oficial 2026"}: ${brl.format(r2.preco)}`;

    renderComparativo(e);
  }

  function renderComparativo(e) {
    const lista = $("comparativo");
    if (!e) { lista.innerHTML = `<li class="dica">Informe o custo para comparar.</li>`; return; }
    const linhas = MARKETPLACES.map((mp) => {
      const frete = mp === e.mp ? e.frete : FRETE_INCLUSO.includes(mp) ? 0 : e.frete;
      const r = resolver(mp, e.modo, e, frete);
      return { mp, r: r.erro ? null : r };
    });
    const menor = Math.min(...linhas.filter((l) => l.r).map((l) => l.r.preco));
    lista.innerHTML = linhas
      .map(({ mp, r }) => {
        const nome = REGRAS[mp].nome;
        const selo = r && r.preco === menor ? `<span class="selo">menor preço</span>` : "";
        const corpo = r
          ? `<span class="cmp-nome">${nome}${selo}</span>
             <span class="cmp-preco">${brl.format(r.preco)}</span>
             <span class="cmp-sub">Taxas ${brl.format(r.tarifaPct + r.fixo)} · Frete ${brl.format(r.frete)} · Lucro ${brl.format(r.lucro)}</span>`
          : `<span class="cmp-nome">${nome}</span><span class="cmp-preco">—</span><span class="cmp-sub">Margem inviável</span>`;
        return `<li class="${mp === e.mp ? "atual" : ""}"><button type="button" data-mp="${mp}" aria-label="Selecionar ${nome}">${corpo}</button></li>`;
      })
      .join("");
  }

  function renderHistorico(mp) {
    const h = HIST[mp];
    $("historico-nome").textContent = "· " + REGRAS[mp].nome;
    const kpis = [
      ["Pedidos", h.pedidos.toLocaleString("pt-BR")],
      ["Taxa média real", pct(h.taxaMedia)],
      ["Margem média", pct(h.margemMedia)],
      ["Frete mediano", brl.format(h.freteMediano)],
      ["Ticket mediano", brl.format(h.ticketMediano)],
      ["Frete / venda", pct(h.freteSobreVenda)],
    ];
    $("historico").innerHTML = kpis.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");
    const faixas = h.faixas
      .map((f) => `${f.max ? `${brl.format(f.min)}–${brl.format(f.max)}` : `acima de ${brl.format(f.min)}`}: ${pct(f.taxa)}`)
      .join(" · ");
    $("historico-meta").textContent =
      `Taxa real por faixa de preço: ${faixas}. Período ${window.HISTORICO.meta.periodo}.` +
      (mp === "tiktok" ? " Apenas pedidos após 15/07/2026." : "") +
      (mp === "temu" ? " Retenção efetiva no modelo de preço de fornecimento." : "");
  }

  function atualizarInterface() {
    const mp = radio("marketplace");
    const modo = radio("modo");
    const oficial = modo === "oficial";

    alternar($("bloco-ml"), mp === "mercadolivre" && oficial);
    alternar($("ml-custom-wrap"), $("ml-categoria").value === "custom");

    const temComissao = (mp === "amazon" || mp === "temu") && oficial;
    alternar($("bloco-comissao"), temComissao);
    if (mp === "amazon" || mp === "temu") {
      $("comissao-legenda").textContent = `Comissão ${REGRAS[mp].nome}`;
      $("comissao").value = (comissaoDigitada[mp] * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
    }

    const h = HIST[mp];
    trocarTexto($("frete-dica"), FRETE_INCLUSO.includes(mp)
      ? `Normalmente R$ 0: o frete grátis já está embutido na tarifa.`
      : mp === "mercadolivre"
        ? `Abaixo de R$ 79, informe o custo operacional (histórico: ${brl.format(h.faixas[0].freteMediano)}). Acima, o frete grátis pago (mediana ${brl.format(h.freteMediano)}).`
        : `Acima de R$ 79 (mediana do histórico: ${brl.format(h.freteMediano)}). Abaixo, a tarifa DBA fixa é aplicada automaticamente.`);

    $("modo-dica").textContent = oficial
      ? "Regras publicadas por cada plataforma: comissão e tarifas fixas por faixa de preço."
      : "Taxa efetiva que pagamos de fato em cada faixa de preço, já incluindo campanhas e subsídios.";
    trocarTexto($("nota"), REGRAS[mp].nota);

    renderHistorico(mp);
    calcular();
  }

  function iniciar() {
    $("ml-categoria").innerHTML = window.ML_CATEGORIAS
      .map((c) => `<option value="${c.id}"${c.id === "12" ? " selected" : ""}>${c.nome}</option>`)
      .join("");

    $("comissao").addEventListener("input", () => {
      const mp = radio("marketplace");
      const v = num($("comissao"));
      if (Number.isFinite(v)) comissaoDigitada[mp] = v / 100;
      calcular();
    });

    document.querySelectorAll('input[name="marketplace"], input[name="modo"]').forEach((el) => el.addEventListener("change", atualizarInterface));
    $("ml-categoria").addEventListener("change", atualizarInterface);
    document.querySelectorAll('input[name="ml-tipo"]').forEach((el) => el.addEventListener("change", calcular));
    ["custo", "frete", "margem", "outros", "extra", "ml-custom"].forEach((id) => $(id).addEventListener("input", calcular));
    $("form").addEventListener("submit", (ev) => ev.preventDefault());

    // Ajustes avançados
    alternar($("bloco-avancado"), false);
    $("btn-avancado").addEventListener("click", () => {
      const aberto = $("btn-avancado").getAttribute("aria-expanded") !== "true";
      $("btn-avancado").setAttribute("aria-expanded", String(aberto));
      alternar($("bloco-avancado"), aberto);
    });

    // Clicar numa linha do comparativo seleciona aquele marketplace
    $("comparativo").addEventListener("click", (ev) => {
      const btn = ev.target.closest("button[data-mp]");
      if (!btn) return;
      const input = document.querySelector(`input[name="marketplace"][value="${btn.dataset.mp}"]`);
      input.checked = true;
      atualizarInterface();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    // Barra de preço fixa no celular: some quando o card de resultado está visível
    const barra = $("barra-preco");
    barra.addEventListener("click", () => $("card-resultado").scrollIntoView({ behavior: "smooth", block: "center" }));
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(([entrada]) => barra.classList.toggle("oculta", entrada.isIntersecting), { threshold: 0.2 })
        .observe($("card-resultado"));
    }

    atualizarInterface();
    requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.remove("carregando")));
    // No desktop já deixa o cursor no custo; no celular isso abriria o teclado sem pedir
    if (matchMedia("(min-width: 900px)").matches) $("custo").focus({ preventScroll: true });
  }

  // Exposto para testes no console / Node
  window.Calculadora = { resolver, montarFaixas, detalhar };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})();

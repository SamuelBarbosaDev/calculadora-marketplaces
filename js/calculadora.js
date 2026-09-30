(function () {
  "use strict";

  const IMPOSTO = window.IMPOSTO;
  const REGRAS = window.REGRAS;
  const HIST = window.HISTORICO.plataformas;
  const MARKETPLACES = ["mercadolivre", "shopee", "amazon", "tiktok", "temu"];
  const FRETE_INCLUSO = ["shopee", "tiktok", "temu"];

  const $ = (id) => document.getElementById(id);
  const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const pct = (v, casas = 1) =>
    (v * 100).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas }) + "%";

  function num(el) {
    const s = String(el.value).trim().replace(/\s|R\$/g, "");
    if (!s) return 0;
    // aceita "1.234,56", "1234,56" e "1234.56"
    const normal = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
    const v = parseFloat(normal);
    return Number.isFinite(v) ? v : NaN;
  }

  // ---------- Estado dos inputs ----------

  function lerEntrada() {
    const mlCat = window.ML_CATEGORIAS.find((c) => c.id === $("ml-categoria").value);
    let mlPct = mlCat.pct ?? num($("ml-custom")) / 100;
    if (document.querySelector('input[name="ml-tipo"]:checked').value === "premium") {
      mlPct += window.ML_PREMIUM_ADICIONAL;
    }
    return {
      mp: $("marketplace").value,
      modo: document.querySelector('input[name="modo"]:checked').value,
      custo: num($("custo")),
      frete: num($("frete")),
      margem: num($("margem")) / 100,
      outros: num($("outros")) / 100,
      extra: num($("extra")),
      mlPct,
      comissao: {
        amazon: comissaoDigitada.amazon,
        temu: comissaoDigitada.temu,
      },
    };
  }

  const comissaoDigitada = {
    amazon: REGRAS.amazon.comissaoPadrao,
    temu: REGRAS.temu.comissaoPadrao,
  };

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
    if (melhor === null) return { erro: "A soma de taxas, imposto, outros custos e margem chega a 100% ou mais. Reduza a margem." };
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

  // ---------- Renderização ----------

  function linha(rotulo, valor, classe = "") {
    return `<tr class="${classe}"><th scope="row">${rotulo}</th><td>${valor}</td></tr>`;
  }

  function renderDetalhe(r) {
    const tarifa = r.tarifaPct + r.fixo;
    const tarifaTxt =
      r.fixo > 0
        ? `${brl.format(tarifa)} <small>(${pct(r.faixa.pct)} + ${brl.format(r.fixo)})</small>`
        : `${brl.format(tarifa)} <small>(${pct(r.faixa.pct)})</small>`;
    const freteTxt =
      r.faixa.freteFixo != null
        ? `${brl.format(r.frete)} <small>(tarifa DBA fixa)</small>`
        : brl.format(r.frete);
    const rows = [
      linha("Custo do produto", brl.format(ultimaEntrada.custo)),
      ultimaEntrada.extra ? linha("Custo extra por unidade", brl.format(ultimaEntrada.extra)) : "",
      linha("Frete", freteTxt),
      linha("Tarifa do marketplace", tarifaTxt),
      linha("Imposto", `${brl.format(r.imposto)} <small>(${pct(IMPOSTO, 0)})</small>`),
      r.outros ? linha("Outros custos", `${brl.format(r.outros)} <small>(${pct(ultimaEntrada.outros)})</small>`) : "",
      linha("Lucro líquido", `${brl.format(r.lucro)} <small>(${pct(r.margem)})</small>`, "total"),
    ];
    $("detalhe").querySelector("tbody").innerHTML = rows.join("");
  }

  let ultimaEntrada = null;

  function calcular() {
    const e = lerEntrada();
    ultimaEntrada = e;
    const erroEl = $("erro");
    const invalido = [e.custo, e.frete, e.margem, e.outros, e.extra, e.mlPct].some((v) => Number.isNaN(v));

    if (invalido || e.custo <= 0) {
      $("preco").textContent = "—";
      $("preco-arred").textContent = "";
      $("detalhe").querySelector("tbody").innerHTML = "";
      $("outro-modo").textContent = "";
      erroEl.hidden = !invalido;
      erroEl.textContent = invalido ? "Verifique os valores digitados (use apenas números)." : "";
      renderComparativo(null);
      return;
    }

    const r = resolver(e.mp, e.modo, e, e.frete);
    if (r.erro) {
      $("preco").textContent = "—";
      $("preco-arred").textContent = "";
      $("detalhe").querySelector("tbody").innerHTML = "";
      $("outro-modo").textContent = "";
      erroEl.hidden = false;
      erroEl.textContent = r.erro;
      renderComparativo(e);
      return;
    }
    erroEl.hidden = true;

    $("preco").textContent = brl.format(r.preco);
    const a = arredondar(r, e, e.frete);
    $("preco-arred").innerHTML = a && Math.abs(a.preco - r.preco) >= 0.005
      ? `Preço comercial: <strong>${brl.format(a.preco)}</strong> → lucro ${brl.format(a.lucro)} (${pct(a.margem)})`
      : "";
    renderDetalhe(r);

    const outroModo = e.modo === "oficial" ? "historico" : "oficial";
    const r2 = resolver(e.mp, outroModo, e, e.frete);
    $("outro-modo").textContent = r2.erro
      ? ""
      : `Pelo ${outroModo === "historico" ? "seu histórico real de taxas" : "tabela oficial 2026"}: ${brl.format(r2.preco)}`;

    renderComparativo(e);
  }

  function renderComparativo(e) {
    const tbody = $("comparativo").querySelector("tbody");
    if (!e) { tbody.innerHTML = ""; return; }
    const linhas = MARKETPLACES.map((mp) => {
      const frete = mp === e.mp ? e.frete : FRETE_INCLUSO.includes(mp) ? 0 : e.frete;
      const r = resolver(mp, e.modo, e, frete);
      if (r.erro) return { mp, erro: true };
      return { mp, r };
    });
    const validos = linhas.filter((l) => !l.erro).map((l) => l.r.preco);
    const menor = Math.min(...validos);
    tbody.innerHTML = linhas
      .map(({ mp, r, erro }) => {
        const nome = REGRAS[mp].nome;
        const cls = [mp === e.mp ? "atual" : "", !erro && r.preco === menor ? "menor" : ""].join(" ");
        if (erro) return `<tr class="${cls}"><th scope="row">${nome}</th><td colspan="4">margem inviável</td></tr>`;
        return `<tr class="${cls}"><th scope="row">${nome}</th>
          <td class="forte">${brl.format(r.preco)}</td>
          <td>${brl.format(r.tarifaPct + r.fixo)}</td>
          <td>${brl.format(r.frete)}</td>
          <td>${brl.format(r.lucro)}</td></tr>`;
      })
      .join("");
  }

  function renderHistorico(mp) {
    const h = HIST[mp];
    const kpis = [
      ["Pedidos", h.pedidos.toLocaleString("pt-BR")],
      ["Taxa média real", pct(h.taxaMedia)],
      ["Frete mediano", brl.format(h.freteMediano)],
      ["Margem média obtida", pct(h.margemMedia)],
      ["Ticket mediano", brl.format(h.ticketMediano)],
    ];
    $("historico").innerHTML = kpis.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");
    const faixas = h.faixas
      .map((f) => `${f.max ? `${brl.format(f.min)}–${brl.format(f.max)}` : `acima de ${brl.format(f.min)}`}: ${pct(f.taxa)}`)
      .join(" · ");
    $("historico-meta").textContent =
      `Taxa real por faixa de preço — ${faixas}. Período ${window.HISTORICO.meta.periodo}.` +
      (mp === "tiktok" ? " (TikTok: apenas pedidos após 15/07/2026.)" : "") +
      (mp === "temu" ? " (Temu: retenção efetiva no modelo de preço de fornecimento.)" : "");
  }

  function atualizarInterface() {
    const mp = $("marketplace").value;
    const modo = document.querySelector('input[name="modo"]:checked').value;

    $("bloco-ml").hidden = mp !== "mercadolivre";
    $("bloco-ml").disabled = modo === "historico";
    $("ml-custom-wrap").hidden = $("ml-categoria").value !== "custom";

    const temComissao = mp === "amazon" || mp === "temu";
    $("bloco-comissao").hidden = !temComissao;
    $("bloco-comissao").disabled = modo === "historico";
    if (temComissao) {
      $("comissao-legenda").textContent = REGRAS[mp].nome;
      $("comissao").value = (comissaoDigitada[mp] * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
    }

    const h = HIST[mp];
    $("frete-dica").textContent = FRETE_INCLUSO.includes(mp)
      ? `Normalmente R$ 0: o frete grátis já está embutido na tarifa. Mediana do histórico: ${brl.format(h.freteMediano)}.`
      : mp === "mercadolivre"
        ? `Mediana do histórico: ${brl.format(h.faixas[0].freteMediano)} abaixo de R$ 79 · ${brl.format(h.freteMediano)} no geral (${pct(h.freteSobreVenda)} da venda).`
        : `Acima de R$ 79. Mediana do histórico: ${brl.format(h.freteMediano)} (${pct(h.freteSobreVenda)} da venda).`;

    $("modo-dica").textContent =
      modo === "oficial"
        ? "Usa as regras publicadas por cada plataforma (comissão + tarifas fixas por faixa)."
        : "Usa a taxa efetiva média que você realmente pagou, por faixa de preço — já reflete campanhas e subsídios.";
    $("nota").textContent = REGRAS[mp].nota;

    renderHistorico(mp);
    calcular();
  }

  function iniciar() {
    $("ml-categoria").innerHTML = window.ML_CATEGORIAS
      .map((c) => `<option value="${c.id}"${c.id === "12" ? " selected" : ""}>${c.nome}</option>`)
      .join("");

    $("comissao").addEventListener("input", () => {
      const mp = $("marketplace").value;
      const v = num($("comissao"));
      if (Number.isFinite(v)) comissaoDigitada[mp] = v / 100;
      calcular();
    });

    $("marketplace").addEventListener("change", atualizarInterface);
    $("ml-categoria").addEventListener("change", atualizarInterface);
    document.querySelectorAll('input[name="modo"]').forEach((el) => el.addEventListener("change", atualizarInterface));
    document.querySelectorAll('input[name="ml-tipo"]').forEach((el) => el.addEventListener("change", calcular));
    ["custo", "frete", "margem", "outros", "extra", "ml-custom"].forEach((id) => $(id).addEventListener("input", calcular));
    $("form").addEventListener("submit", (ev) => ev.preventDefault());

    atualizarInterface();
  }

  // Exposto para testes no console / Node
  window.Calculadora = { resolver, montarFaixas, detalhar };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})();

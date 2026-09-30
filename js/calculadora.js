(function () {
  "use strict";

  const REGRAS = window.REGRAS;
  const HIST = window.HISTORICO.plataformas;
  const MARKETPLACES = ["mercadolivre", "shopee", "amazon", "tiktok", "temu"];
  const eValorAReceber = (mp) => Boolean(REGRAS[mp].valorAReceber);
  const freteDoCliente = (mp) => Boolean(REGRAS[mp].fretePeloCliente);

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

  // Campo vazio = null (usa o valor automático); texto inválido = NaN
  function numOuNulo(el) {
    return String(el.value).trim() === "" ? null : num(el);
  }

  // ---------- Estado dos inputs ----------

  const comissaoDigitada = {
    amazon: REGRAS.amazon.comissaoPadrao,
  };

  // Tarifa ajustada manualmente, por marketplace: { pct (fração) | null, fixo (R$) | null }
  const tarifaManual = {};

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
      imposto: num($("imposto")) / 100,
      outros: num($("outros")) / 100,
      extra: num($("extra")),
      mlPct,
      comissao: { amazon: comissaoDigitada.amazon },
      tarifaManual,
    };
  }

  // ---------- Modelo de tarifas ----------

  // Faixas de tarifa: [{min, max, pct, fixo}]
  function faixasTarifa(mp, modo, e) {
    // Tarifa manual substitui a tabela (nos dois modos): pct% × preço + fixo, sem faixas
    const manual = e.tarifaManual[mp];
    if (manual) return [{ min: 0, max: Infinity, pct: manual.pct ?? 0, fixo: manual.fixo ?? 0, manual: true }];
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
      if (ft && ff) faixas.push({ min, max, pct: ft.pct, fixo: ft.fixo, freteFixo: ff.freteFixo, manual: Boolean(ft.manual) });
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
    const imposto = e.imposto * p;
    const outros = e.outros * p;
    const lucro = p - e.custo - e.extra - frete - tarifaPct - f.fixo - imposto - outros;
    return { preco: p, faixa: f, frete, tarifaPct, fixo: f.fixo, imposto, outros, lucro, margem: lucro / p };
  }

  // Resolve o menor preço que atinge a margem desejada.
  // Em cada faixa: P = (custo + extra + frete + fixo) / (1 − pct − imposto − outros − margem).
  // Se o P encontrado cair abaixo do início da faixa, o início da faixa já entrega margem ≥ alvo.
  function resolver(mp, modo, e, freteInformado) {
    if (eValorAReceber(mp)) return resolverValorAReceber(e);
    if (freteDoCliente(mp)) freteInformado = 0;
    const faixas = montarFaixas(mp, modo, e);
    let melhor = null;
    for (const f of faixas) {
      const den = 1 - f.pct - e.imposto - e.outros - e.margem;
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

  // Temu: a plataforma define o preço ao consumidor e o cliente paga o frete.
  // O vendedor informa o valor a receber, com lucro e imposto aplicados em cascata:
  // valor = (custo + extra) × (1 + margem) × (1 + imposto) × (1 + outros)
  // Ex.: 300 × 1,15 × 1,05 = R$ 362,25
  function resolverValorAReceber(e) {
    const base = e.custo + e.extra;
    const lucro = base * e.margem;
    const imposto = (base + lucro) * e.imposto;
    const outros = (base + lucro + imposto) * e.outros;
    const valor = Math.ceil((base + lucro + imposto + outros) * 100 - 1e-6) / 100;
    return {
      valorAReceber: true,
      preco: valor,
      faixa: { pct: 0, freteFixo: null },
      frete: 0,
      tarifaPct: 0,
      fixo: 0,
      imposto,
      outros,
      lucro,
      margem: base > 0 ? lucro / base : 0, // sobre o custo
    };
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
    if (r.valorAReceber) {
      $("detalhe").innerHTML = [
        item("Custo do produto", brl.format(e.custo)),
        e.extra ? item("Custo extra por unidade", brl.format(e.extra)) : "",
        item("Imposto", brl.format(r.imposto), pct(e.imposto) + " sobre custo + lucro"),
        r.outros ? item("Outros custos", brl.format(r.outros), pct(e.outros)) : "",
        item("Frete", brl.format(0), "pago pelo cliente"),
        item("Lucro líquido", brl.format(r.lucro), `${pct(r.margem)} sobre o custo`, "total"),
      ].join("");
      return;
    }
    const tarifa = r.tarifaPct + r.fixo;
    const tarifaSub = (r.fixo > 0 ? `${pct(r.faixa.pct)} + ${brl.format(r.fixo)}` : pct(r.faixa.pct)) +
      (r.faixa.manual ? " · manual" : "");
    $("detalhe").innerHTML = [
      item("Custo do produto", brl.format(e.custo)),
      e.extra ? item("Custo extra por unidade", brl.format(e.extra)) : "",
      item("Frete", brl.format(r.frete), freteDoCliente(e.mp) ? "pago pelo cliente" : r.faixa.freteFixo != null ? "tarifa DBA fixa" : ""),
      item("Tarifa do marketplace", brl.format(tarifa), tarifaSub),
      item("Imposto", brl.format(r.imposto), pct(e.imposto)),
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
    const manual = e.tarifaManual[e.mp] || {};
    const invalido = [e.custo, e.frete, e.margem, e.imposto, e.outros, e.extra, e.mlPct, manual.pct, manual.fixo]
      .some((v) => Number.isNaN(v));

    if (invalido) { limparResultado("Verifique os valores digitados (use apenas números)."); renderComparativo(null); return; }
    if (e.custo <= 0) { limparResultado(""); renderComparativo(null); return; }

    const r = resolver(e.mp, e.modo, e, e.frete);
    if (r.erro) { limparResultado(r.erro); renderComparativo(e); return; }
    $("erro").hidden = true;

    animarValor($("preco"), r.preco);
    $("barra-preco-valor").textContent = brl.format(r.preco);
    renderDetalhe(r, e);
    mostrarTarifaAutomatica(r);

    if (r.valorAReceber) {
      // O preço ao consumidor é definido pela plataforma: sem arredondamento comercial nem comparação de modos
      $("preco-arred").textContent = "Preço de fornecimento. O preço ao consumidor é definido pela Temu.";
      $("outro-modo").textContent = "";
    } else {
      const a = arredondar(r, e, r.frete);
      $("preco-arred").innerHTML = a && Math.abs(a.preco - r.preco) >= 0.005
        ? `Preço comercial <strong>${brl.format(a.preco)}</strong> · lucro ${brl.format(a.lucro)} (${pct(a.margem)})`
        : "";
      const outroModo = e.modo === "oficial" ? "historico" : "oficial";
      const r2 = resolver(e.mp, outroModo, e, e.frete);
      $("outro-modo").textContent = r.faixa.manual
        ? "Tarifa ajustada manualmente em Ajustes avançados."
        : r2.erro
          ? ""
          : `${outroModo === "historico" ? "Pelo nosso histórico de taxas" : "Pela tabela oficial 2026"}: ${brl.format(r2.preco)}`;
    }

    renderComparativo(e);
  }

  function renderComparativo(e) {
    const lista = $("comparativo");
    if (!e) { lista.innerHTML = `<li class="dica">Informe o custo para comparar.</li>`; return; }
    const linhas = MARKETPLACES.map((mp) => {
      const r = resolver(mp, e.modo, e, e.frete);
      return { mp, r: r.erro ? null : r };
    });
    // O valor a receber da Temu não é preço ao consumidor, então fica fora da disputa de "menor preço"
    const menor = Math.min(...linhas.filter((l) => l.r && !l.r.valorAReceber).map((l) => l.r.preco));
    lista.innerHTML = linhas
      .map(({ mp, r }) => {
        const nome = REGRAS[mp].nome;
        let corpo;
        if (!r) {
          corpo = `<span class="cmp-nome">${nome}</span><span class="cmp-preco">—</span><span class="cmp-sub">Margem inviável</span>`;
        } else if (r.valorAReceber) {
          corpo = `<span class="cmp-nome">${nome}<span class="selo selo-neutro">a receber</span></span>
             <span class="cmp-preco">${brl.format(r.preco)}</span>
             <span class="cmp-sub">Sem comissão · Frete pago pelo cliente · Lucro ${brl.format(r.lucro)}</span>`;
        } else {
          const selo = r.preco === menor ? `<span class="selo">menor preço</span>` : "";
          corpo = `<span class="cmp-nome">${nome}${selo}</span>
             <span class="cmp-preco">${brl.format(r.preco)}</span>
             <span class="cmp-sub">Taxas ${brl.format(r.tarifaPct + r.fixo)}${r.faixa.manual ? " (manual)" : ""} · ${freteDoCliente(mp) ? "Frete pago pelo cliente" : `Frete ${brl.format(r.frete)}`} · Lucro ${brl.format(r.lucro)}</span>`;
        }
        return `<li class="${mp === e.mp ? "atual" : ""}"><button type="button" data-mp="${mp}" aria-label="Selecionar ${nome}">${corpo}</button></li>`;
      })
      .join("");
  }

  // Mostra nos placeholders a tarifa automática aplicada ao preço atual, para servir de referência
  function mostrarTarifaAutomatica(r) {
    if (r.faixa.manual || r.valorAReceber) return;
    $("tarifa-pct").placeholder = (r.faixa.pct * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
    $("tarifa-fixa").placeholder = r.fixo.toLocaleString("pt-BR", { minimumFractionDigits: 2 });
  }

  // Avisos da tarifa manual: selo no botão "Ajustes avançados", link de limpar e dica
  function avisosTarifa(mp) {
    const m = tarifaManual[mp];
    $("tarifa-limpar").hidden = !m;
    $("selo-manual").hidden = !m;
    $("tarifa-dica").textContent = eValorAReceber(mp)
      ? `A ${REGRAS[mp].nome} não cobra tarifa do vendedor.`
      : m
        ? `Tarifa manual ativa só para ${REGRAS[mp].nome}: substitui a tabela e o histórico. Campo vazio conta como zero.`
        : `Em branco usa a tarifa automática (mostrada em cinza para o preço atual). Preencha para substituí-la só na ${REGRAS[mp].nome}.`;
  }

  // Ao trocar de marketplace, carrega nos campos a tarifa manual dele (se houver)
  function atualizarTarifaManual(mp) {
    const m = tarifaManual[mp];
    const semTarifa = eValorAReceber(mp);
    $("tarifa-mp").textContent = "· " + REGRAS[mp].nome;
    $("tarifa-pct").value = m && m.pct != null ? (m.pct * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "";
    $("tarifa-fixa").value = m && m.fixo != null ? m.fixo.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "";
    $("tarifa-pct").disabled = $("tarifa-fixa").disabled = semTarifa;
    if (semTarifa) $("tarifa-pct").placeholder = $("tarifa-fixa").placeholder = "0";
    avisosTarifa(mp);
  }

  function lerTarifaManual() {
    const mp = radio("marketplace");
    const p = numOuNulo($("tarifa-pct"));
    const f = numOuNulo($("tarifa-fixa"));
    if (p === null && f === null) delete tarifaManual[mp];
    else tarifaManual[mp] = { pct: p === null ? null : p / 100, fixo: f };
    avisosTarifa(mp);
    calcular();
  }

  function renderHistorico(mp) {
    const h = HIST[mp];
    $("historico-nome").textContent = "· " + REGRAS[mp].nome;
    const kpis = eValorAReceber(mp)
      ? [
          ["Pedidos", h.pedidos.toLocaleString("pt-BR")],
          ["Lucro médio sobre o custo", pct(h.lucroSobreCusto)],
          ["Preço mediano ao cliente", brl.format(h.ticketMediano)],
        ]
      : [
          ["Pedidos", h.pedidos.toLocaleString("pt-BR")],
          ["Taxa média real", pct(h.taxaMedia)],
          ["Margem média", pct(h.margemMedia)],
          ["Frete mediano", brl.format(h.freteMediano)],
          ["Ticket mediano", brl.format(h.ticketMediano)],
          ["Frete / venda", pct(h.freteSobreVenda)],
        ];
    $("historico").innerHTML = kpis.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");
    const periodo = `Período ${window.HISTORICO.meta.periodo}.`;
    if (eValorAReceber(mp)) {
      $("historico-meta").textContent = periodo;
      return;
    }
    const faixas = h.faixas
      .map((f) => `${f.max ? `${brl.format(f.min)}–${brl.format(f.max)}` : `acima de ${brl.format(f.min)}`}: ${pct(f.taxa)}`)
      .join(" · ");
    $("historico-meta").textContent =
      `Taxa real por faixa de preço: ${faixas}. ${periodo}` +
      (mp === "tiktok" ? " Apenas pedidos após 15/07/2026." : "");
  }

  function atualizarInterface() {
    const mp = radio("marketplace");
    const modo = radio("modo");
    const oficial = modo === "oficial";
    const aReceber = eValorAReceber(mp);

    alternar($("bloco-ml"), mp === "mercadolivre" && oficial);
    alternar($("ml-custom-wrap"), $("ml-categoria").value === "custom");

    alternar($("bloco-comissao"), mp === "amazon" && oficial);
    if (mp === "amazon") {
      $("comissao-legenda").textContent = `Comissão ${REGRAS[mp].nome}`;
      $("comissao").value = (comissaoDigitada[mp] * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
    }

    // Quando o cliente paga o frete o campo fica bloqueado (o valor digitado é mantido para os outros)
    $("frete").disabled = freteDoCliente(mp);
    $("margem-base").textContent = aReceber ? "sobre o custo" : "sobre a venda";
    $("imposto-base").textContent = aReceber ? "sobre custo + lucro" : "sobre a venda";
    $("res-rotulo").textContent = aReceber ? "Valor a receber" : "Preço de venda sugerido";
    $("barra-preco-rotulo").textContent = aReceber ? "Valor a receber" : "Preço sugerido";

    const h = HIST[mp];
    trocarTexto($("frete-dica"), freteDoCliente(mp)
      ? `Na ${REGRAS[mp].nome} o frete é pago pelo cliente e não entra no cálculo.`
      : mp === "mercadolivre"
        ? `Abaixo de R$ 79, informe o custo operacional (histórico: ${brl.format(h.faixas[0].freteMediano)}). Acima, o frete grátis pago (mediana ${brl.format(h.freteMediano)}).`
        : `Acima de R$ 79 (mediana do histórico: ${brl.format(h.freteMediano)}). Abaixo, a tarifa DBA fixa é aplicada automaticamente.`);

    $("modo-dica").textContent = aReceber
      ? "Na Temu não há comissão para o vendedor, então a base das taxas não altera o valor a receber."
      : oficial
        ? "Regras publicadas por cada plataforma: comissão e tarifas fixas por faixa de preço."
        : "Taxa efetiva que pagamos de fato em cada faixa de preço, já incluindo campanhas e subsídios.";
    trocarTexto($("nota"), REGRAS[mp].nota);

    atualizarTarifaManual(mp);
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
    ["custo", "frete", "margem", "imposto", "outros", "extra", "ml-custom"].forEach((id) => $(id).addEventListener("input", calcular));
    $("form").addEventListener("submit", (ev) => ev.preventDefault());

    // Tarifa manual por marketplace
    ["tarifa-pct", "tarifa-fixa"].forEach((id) => $(id).addEventListener("input", lerTarifaManual));
    $("tarifa-limpar").addEventListener("click", () => {
      delete tarifaManual[radio("marketplace")];
      atualizarTarifaManual(radio("marketplace"));
      calcular();
    });

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

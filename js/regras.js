// Regras oficiais de tarifas dos marketplaces (vigentes em set/2026).
// Para atualizar quando uma plataforma mudar a política, edite apenas este arquivo.
//
// Cada faixa: { min, max, pct, fixo }  → tarifa = pct * preço + fixo, para min <= preço < max
// "freteFixo" (opcional) substitui o frete informado pelo usuário naquela faixa.
// "fretePeloCliente: true" indica que o cliente paga o frete: o campo é bloqueado e o frete vale R$ 0.

window.IMPOSTO = 0.05; // padrão de 5% sobre o valor final de venda (editável nos ajustes avançados)

// Categorias do Mercado Livre conferidas no Simulador de custos do ML. Têm prioridade sobre
// js/ml_categorias.js (tabela geral por subcategoria) e aparecem primeiro na busca.
// Obs.: o Premium NÃO é sempre Clássico + 5 p.p.; ele varia com a categoria e o parcelamento.
// Para adicionar: rode o simulador no Central de vendedores e copie os dois percentuais.
window.ML_CATEGORIAS_VERIFICADAS = [
  {
    id: null,
    nome: "Cadeiras para Escritório (inclui gamer)",
    caminho: "Casa, Móveis e Decoração › Móveis para Casa › Cadeiras, Sofás e Banquetas",
    c: 11,
    p: 14, // Premium "10x sem acréscimo"
    fonte: "Simulador ML, set/2026 (anúncio MLB6641507926)",
  },
];
window.ML_CATEGORIA_PADRAO = "Cadeiras para Escritório (inclui gamer)";

window.REGRAS = {
  mercadolivre: {
    nome: "Mercado Livre",
    nota:
      "Comissão da subcategoria (Clássico 10–14%; o Premium varia com a categoria e o parcelamento — " +
      "confira no Simulador de custos do ML). Desde mar/2026 não há mais tarifa fixa: " +
      "abaixo de R$ 79 cobra-se um custo operacional por peso/medidas — informe-o no campo Frete " +
      "(mediana do histórico: R$ 6,75). Acima de R$ 79 informe o custo do frete grátis que você paga.",
    // As faixas são montadas dinamicamente a partir da categoria escolhida (ver calculadora.js)
    faixas: null,
  },
  shopee: {
    nome: "Shopee",
    nota:
      "Tabela CNPJ desde 01/03/2026 (comissão + taxa de transação inclusas). O frete é pago pelo cliente. " +
      "Sem teto por item. Vendedor CPF com mais de 450 pedidos/90 dias paga +R$ 3,00 por item.",
    fretePeloCliente: true,
    faixas: [
      { min: 0, max: 8, pct: 0.5, fixo: 0 },
      { min: 8, max: 80, pct: 0.2, fixo: 4 },
      { min: 80, max: 100, pct: 0.14, fixo: 16 },
      { min: 100, max: 200, pct: 0.14, fixo: 20 },
      { min: 200, max: Infinity, pct: 0.14, fixo: 26 },
    ],
  },
  tiktok: {
    nome: "TikTok Shop",
    nota:
      "Desde 15/07/2026: abaixo de R$ 50 → 10% comissão + R$ 4; a partir de R$ 50 → 6% + R$ 6. " +
      "Soma-se a taxa de 6% do Programa de Frete Grátis. O frete em si é pago pelo cliente. " +
      "Comissão de afiliados é à parte (use “Outros custos %”).",
    fretePeloCliente: true,
    faixas: [
      { min: 0, max: 50, pct: 0.16, fixo: 4 },
      { min: 50, max: Infinity, pct: 0.12, fixo: 6 },
    ],
  },
  amazon: {
    nome: "Amazon",
    nota:
      "Comissão por categoria (em geral 10–15%; no seu histórico a mais comum é 13,5%). " +
      "No DBA, abaixo de R$ 79 o envio tem tarifa fixa (R$ 4,50 / 6,50 / 6,75) e substitui o frete informado.",
    comissaoPadrao: 0.135,
    // As faixas são montadas com a comissão escolhida (ver calculadora.js)
    faixasDBA: [
      { min: 0, max: 30, freteFixo: 4.5 },
      { min: 30, max: 50, freteFixo: 6.5 },
      { min: 50, max: 79, freteFixo: 6.75 },
      { min: 79, max: Infinity, freteFixo: null },
    ],
  },
  temu: {
    nome: "Temu",
    nota:
      "Na Temu quem define o preço ao consumidor é a plataforma. Você informa o valor a receber " +
      "(preço de fornecimento): custo + lucro sobre o custo + imposto. O frete é pago pelo cliente.",
    // Sem comissão nem frete: valor a receber = custo × (1 + margem) × (1 + imposto)
    valorAReceber: true,
    fretePeloCliente: true,
  },
};

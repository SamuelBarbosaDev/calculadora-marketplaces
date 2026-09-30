// Regras oficiais de tarifas dos marketplaces (vigentes em set/2026).
// Para atualizar quando uma plataforma mudar a política, edite apenas este arquivo.
//
// Cada faixa: { min, max, pct, fixo }  → tarifa = pct * preço + fixo, para min <= preço < max
// "freteFixo" (opcional) substitui o frete informado pelo usuário naquela faixa.

window.IMPOSTO = 0.05; // 5% sobre o valor final de venda, em todos os marketplaces

window.ML_CATEGORIAS = [
  { id: "10", pct: 0.10, nome: "10% — Livros, revistas e comics" },
  { id: "11", pct: 0.11, nome: "11% — Ferramentas elétricas e alguns itens de construção" },
  { id: "12", pct: 0.12, nome: "12% — Eletrônicos, informática, celulares, eletrodomésticos, autopeças" },
  { id: "13", pct: 0.13, nome: "13% — Categorias intermediárias" },
  { id: "14", pct: 0.14, nome: "14% — Casa, móveis, decoração, iluminação, esportes, beleza, brinquedos" },
  { id: "custom", pct: null, nome: "Outra (digitar %)" },
];
window.ML_PREMIUM_ADICIONAL = 0.05; // Premium = Clássico + 5 p.p. (parcelamento sem juros)

window.REGRAS = {
  mercadolivre: {
    nome: "Mercado Livre",
    nota:
      "Comissão da categoria (Clássico 10–14%, Premium 15–19%). Desde mar/2026 não há mais tarifa fixa: " +
      "abaixo de R$ 79 cobra-se um custo operacional por peso/medidas — informe-o no campo Frete " +
      "(mediana do histórico: R$ 6,75). Acima de R$ 79 informe o custo do frete grátis que você paga.",
    // As faixas são montadas dinamicamente a partir da categoria escolhida (ver calculadora.js)
    faixas: null,
  },
  shopee: {
    nome: "Shopee",
    nota:
      "Tabela CNPJ desde 01/03/2026 (comissão + taxa de transação + frete grátis inclusos). " +
      "Sem teto por item. Vendedor CPF com mais de 450 pedidos/90 dias paga +R$ 3,00 por item.",
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
      "Soma-se 6% do Programa de Frete Grátis. Comissão de afiliados é à parte (use “Outros custos %”).",
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
      "Marketplace local: comissão de 16% após a isenção dos primeiros 30 dias. " +
      "No seu histórico (modelo de preço de fornecimento) a retenção efetiva foi de 19,4%.",
    comissaoPadrao: 0.16,
    faixas: null,
  },
};

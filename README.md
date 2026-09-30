# Calculadora de Preços para Marketplaces

Site estático (HTML, CSS e JavaScript puro, sem build) que sugere o **valor final de venda** para Shopee, Amazon, Mercado Livre, Temu e TikTok Shop a partir do custo, do frete e da margem desejada, embutindo o imposto sobre a venda (padrão **5%**, editável em *Ajustes avançados*). Na Temu, onde a plataforma define o preço ao consumidor, a calculadora mostra o **valor a receber**.

## Publicar no GitHub Pages

1. Crie um repositório e envie os arquivos (o `.gitignore` já impede o envio da planilha, que contém nomes de clientes).
2. No repositório: **Settings → Pages → Build and deployment → Deploy from a branch**, branch `main`, pasta `/ (root)`.
3. O site fica em `https://<usuario>.github.io/<repositorio>/`.

Para testar localmente, basta abrir o `index.html` no navegador.

## Estrutura

| Arquivo | Função |
|---|---|
| `index.html` | Interface |
| `css/style.css` | Estilos mobile-first com os tokens visuais da Led.Tools (laranja `#f38002`, superfícies claras, sombras suaves) |
| `img/logo.webp` | Logo do cabeçalho |
| `img/favicon.ico` | Ícone da aba (16, 32 e 48 px) |
| `js/regras.js` | **Tabelas oficiais de tarifas.** Edite aqui quando uma plataforma mudar a política |
| `js/historico.js` | Taxas reais gerada a partir da planilha de vendas (só dados agregados) |
| `js/calculadora.js` | Lógica de cálculo e interface |
| `scripts/gerar_historico.py` | Recalcula `historico.js` a partir de uma planilha nova |

## Como o preço é calculado

Cada marketplace é descrito como faixas de preço, e cada faixa tem uma tarifa percentual e uma tarifa fixa:

```text
Preço = Custo + Custo extra + Frete + (tarifa% × Preço + tarifa fixa) + Imposto% × Preço + Outros% × Preço + Lucro
Lucro = Margem% × Preço

⇒ Preço = (Custo + Custo extra + Frete + tarifa fixa) / (1 − tarifa% − Imposto% − Outros% − Margem%)
```

A margem é calculada **sobre o preço de venda**, igual à coluna `LUCRO %` da planilha. Como a tarifa muda conforme o preço, a fórmula é resolvida em cada faixa e fica valendo o **menor preço que atinge a margem**. Quando o preço cai numa virada de faixa (por exemplo, a Shopee passa de R$ 4 para R$ 16 de tarifa fixa em R$ 80), a calculadora pula para a faixa seguinte. Também é mostrado um "preço comercial" terminado em ,90 que mantém a margem.

### Temu: valor a receber

Na Temu o preço ao consumidor é definido pela plataforma, e o frete é pago pelo cliente. Por isso a calculadora mostra o **valor a receber** (preço de fornecimento), sem comissão nem frete, aplicando lucro e imposto em cascata sobre o custo:

```text
Valor a receber = (Custo + Custo extra) × (1 + Margem%) × (1 + Imposto%) × (1 + Outros%)

Ex.: R$ 300 × 1,15 × 1,05 = R$ 362,25   (lucro R$ 45,00 · imposto R$ 17,25)
```

Aqui a margem é **sobre o custo**, e não sobre a venda.

### Frete pago pelo cliente

Na **Shopee**, no **TikTok Shop** e na **Temu** o frete é pago pelo cliente: o campo de frete fica bloqueado e entra como R$ 0 no cálculo (o histórico confirma frete zero nessas contas). Para mudar isso, edite `fretePeloCliente` em `js/regras.js`.

### Regras oficiais (set/2026)

| Marketplace | Regra aplicada |
|---|---|
| **Mercado Livre** | Comissão por categoria: Clássico 10–14%, Premium +5 p.p. (há um sub-seletor). Desde mar/2026 acabou a tarifa fixa abaixo de R$ 79; no lugar dela entrou um custo operacional por peso, que você informa no campo Frete. |
| **Shopee** (CNPJ, desde 01/03/2026) | < R$ 8: 50% · R$ 8–79,99: 20% + R$ 4 · R$ 80–99,99: 14% + R$ 16 · R$ 100–199,99: 14% + R$ 20 · ≥ R$ 200: 14% + R$ 26. Sem teto. Frete pago pelo cliente. |
| **TikTok Shop** (desde 15/07/2026) | < R$ 50: 10% + R$ 4 · ≥ R$ 50: 6% + R$ 6. Soma-se a taxa de 6% do Programa de Frete Grátis. O frete em si é pago pelo cliente. |
| **Amazon** | Comissão da categoria (padrão 13,5%, a mais comum no histórico, e editável). No DBA, abaixo de R$ 79 o envio é fixo: R$ 4,50 (< R$ 30), R$ 6,50 (R$ 30–49,99) e R$ 6,75 (R$ 50–78,99). |
| **Temu** | Sem comissão para o vendedor e frete pago pelo cliente. Mostra o valor a receber (ver acima). |

### Modo "Seu histórico real"

Neste modo a calculadora usa a **taxa efetiva que a empresa realmente pagou**, calculada como `soma(TAXA PLATAFORMA) / soma(PREÇO PAGO)` por faixa de preço. Os dados vêm de 195.707 pedidos entre 01/06 e 28/09/2026.

| Plataforma | Taxa real média | O que os dados mostraram |
|---|---|---|
| Mercado Livre | 7,9% | Bem abaixo da tabela (11–14%). Muitos pedidos têm tarifa de 4–6%, o que indica campanhas com desconto de tarifa. Abaixo de R$ 79, a coluna FRETE mostra o custo operacional (mediana de R$ 6,75). |
| Shopee | 13,8% | A regra 20% + R$ 4 bate em 81% dos pedidos até R$ 80. Acima de R$ 100 a taxa real fica de R$ 15 a R$ 20 abaixo da tabela (subsídios e campanhas). |
| TikTok Shop | 14,6% | Bate exatamente com a regra oficial: 12% + R$ 4 antes de 15/07 e 12% + R$ 6 depois. |
| Amazon | 14,2% | Comissões de 12%, 12,5%, 13,5% e 16,5%. O frete abaixo de R$ 79 é exatamente a tabela DBA. |
| Temu | — | Não se aplica: a plataforma define o preço ao consumidor. O lucro médio foi de 7,5% sobre o custo. |

Na planilha, o lucro das contas de TikTok e Temu já desconta 5% de imposto; nas demais contas, não.

Com os mesmos dados, a margem líquida média ficou em torno de 7,6% da venda.

## Atualizar os dados

```bash
pip install pandas openpyxl
python scripts/gerar_historico.py "VENDAS PLATAFORMA.xlsx"
```

## Limitações

- As tarifas mudam com frequência e dependem de categoria, reputação e campanhas. Confirme a tarifa exata no painel do vendedor ("custo por venda" do anúncio).
- A comissão de afiliados do TikTok Shop, os anúncios pagos e as devoluções entram no campo **Outros custos (%)**.
- Embalagem e etiqueta entram em **Custo extra por unidade (R$)**.

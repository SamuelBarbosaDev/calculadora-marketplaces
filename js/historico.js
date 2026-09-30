// Gerado a partir de "VENDAS PLATAFORMA.xlsx" (01/06/2026 a 28/09/2026, 195700 pedidos).
// Taxa = soma(TAXA PLATAFORMA) / soma(PREÇO PAGO) por faixa de preço.
window.HISTORICO = {
  "meta": {
    "periodo": "01/06/2026 a 28/09/2026",
    "linhas": 195700
  },
  "plataformas": {
    "mercadolivre": {
      "pedidos": 120392,
      "receita": 39549336.66,
      "taxaMedia": 0.0791,
      "freteMediano": 32.45,
      "freteSobreVenda": 0.1398,
      "margemMedia": 0.0779,
      "ticketMediano": 352.11,
      "faixas": [
        {
          "min": 0,
          "max": 79,
          "taxa": 0.0933,
          "freteMediano": 6.75,
          "n": 11038
        },
        {
          "min": 79,
          "max": 200,
          "taxa": 0.0854,
          "freteMediano": 21.05,
          "n": 29846
        },
        {
          "min": 200,
          "max": 500,
          "taxa": 0.0688,
          "freteMediano": 44.05,
          "n": 60531
        },
        {
          "min": 500,
          "max": null,
          "taxa": 0.0968,
          "freteMediano": 68.65,
          "n": 18977
        }
      ]
    },
    "shopee": {
      "pedidos": 62243,
      "receita": 18680727.99,
      "taxaMedia": 0.1383,
      "freteMediano": 0.0,
      "freteSobreVenda": 0.0,
      "margemMedia": 0.0744,
      "ticketMediano": 340.26,
      "faixas": [
        {
          "min": 0,
          "max": 80,
          "taxa": 0.2972,
          "freteMediano": 0.0,
          "n": 6342
        },
        {
          "min": 80,
          "max": 100,
          "taxa": 0.2671,
          "freteMediano": 0.0,
          "n": 541
        },
        {
          "min": 100,
          "max": 200,
          "taxa": 0.2047,
          "freteMediano": 0.0,
          "n": 13915
        },
        {
          "min": 200,
          "max": null,
          "taxa": 0.1268,
          "freteMediano": 0.0,
          "n": 41445
        }
      ]
    },
    "tiktok": {
      "pedidos": 10466,
      "receita": 2417459.45,
      "taxaMedia": 0.1462,
      "freteMediano": 0.0,
      "freteSobreVenda": 0.0,
      "margemMedia": 0.0758,
      "ticketMediano": 217.08,
      "faixas": [
        {
          "min": 0,
          "max": 50,
          "taxa": 0.2648,
          "freteMediano": 0.0,
          "n": 32
        },
        {
          "min": 50,
          "max": 200,
          "taxa": 0.1608,
          "freteMediano": 0.0,
          "n": 2652
        },
        {
          "min": 200,
          "max": null,
          "taxa": 0.1424,
          "freteMediano": 0.0,
          "n": 5887
        }
      ]
    },
    "amazon": {
      "pedidos": 2334,
      "receita": 621278.49,
      "taxaMedia": 0.1423,
      "freteMediano": 26.5,
      "freteSobreVenda": 0.1508,
      "margemMedia": 0.0471,
      "ticketMediano": 211.46,
      "faixas": [
        {
          "min": 0,
          "max": 79,
          "taxa": 0.121,
          "freteMediano": 6.5,
          "n": 310
        },
        {
          "min": 79,
          "max": 200,
          "taxa": 0.1417,
          "freteMediano": 19.95,
          "n": 741
        },
        {
          "min": 200,
          "max": null,
          "taxa": 0.143,
          "freteMediano": 39.45,
          "n": 1283
        }
      ]
    },
    "temu": {
      "pedidos": 265,
      "receita": 67468.47,
      "taxaMedia": 0.194,
      "freteMediano": 0.0,
      "freteSobreVenda": 0.0,
      "margemMedia": 0.054,
      "ticketMediano": 222.96,
      "faixas": [
        {
          "min": 0,
          "max": null,
          "taxa": 0.194,
          "freteMediano": 0.0,
          "n": 265
        }
      ]
    }
  }
};

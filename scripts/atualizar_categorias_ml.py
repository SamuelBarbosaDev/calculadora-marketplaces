# Atualiza js/ml_categorias.js com as comissões Clássico/Premium por subcategoria do Mercado Livre.
#
# Fonte: páginas públicas por categoria da Marketize Sales
#   https://www.marketizesales.com.br/comissoes/mercado-livre
# (a API oficial do Mercado Livre, /sites/MLB/listing_prices, exige autenticação).
#
# Uso (na raiz do projeto):  python scripts/atualizar_categorias_ml.py
# Leva ~3 minutos: faz uma requisição por categoria com pausa entre elas.

import html
import json
import re
import time
import urllib.request

INDICE = "https://www.marketizesales.com.br/comissoes/mercado-livre"
SAIDA = "js/ml_categorias.js"
AMBIGUOS = {"Outros", "Convencionais"}  # nomes que não identificam a categoria sem o caminho


def baixar(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    return urllib.request.urlopen(req, timeout=20).read().decode("utf-8", "ignore")


def texto(pagina):
    s = re.sub(r"<script.*?</script>|<style.*?</style>", "", pagina, flags=re.S)
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s)))


def pct(v):
    return float(v.replace(",", "."))


def main():
    itens = re.findall(
        r'"name":"([^"]+)","url":"(https://www\.marketizesales\.com\.br/comissoes/mercado-livre/[^"]+)"',
        baixar(INDICE),
    )
    urls = dict((u, n) for n, u in reversed(itens))
    categorias, falhas, datas = [], [], set()
    for url, nome in urls.items():
        if nome in AMBIGUOS:
            continue
        try:
            t = texto(baixar(url))
            tab = re.search(r"Tabela de comissão.*?Premium\s+([\d,]+)%.*?Clássico\s+([\d,]+)%", t)
            cid = re.search(r"ID da categoria:\s*(MLB\d+)", t)
            data = re.search(r"Atualizado em ([a-zç]+ de \d{4})", t)
            if not tab:
                falhas.append(url)
                continue
            if data:
                datas.add(data.group(1))
            categorias.append({
                "id": cid.group(1) if cid else None,
                "nome": nome,
                "c": pct(tab.group(2)),
                "p": pct(tab.group(1)),
            })
        except Exception as erro:  # noqa: BLE001 - segue com as demais categorias
            falhas.append(f"{url} ({erro})")
        time.sleep(0.35)

    categorias.sort(key=lambda c: c["nome"])
    cabecalho = (
        "// Comissões do Mercado Livre por subcategoria (Clássico e Premium, em %).\n"
        f"// Fonte: {INDICE} — atualizado em {', '.join(sorted(datas))}.\n"
        "// Gerado por scripts/atualizar_categorias_ml.py. Não edite à mão: correções\n"
        "// confirmadas no simulador do ML vão em ML_CATEGORIAS_VERIFICADAS (js/regras.js).\n"
    )
    corpo = ",\n".join("  " + json.dumps(c, ensure_ascii=False) for c in categorias)
    with open(SAIDA, "w", encoding="utf-8") as f:
        f.write(cabecalho + "window.ML_CATEGORIAS = [\n" + corpo + "\n];\n")
    print(f"{len(categorias)} categorias gravadas em {SAIDA}; {len(falhas)} falhas")
    for falha in falhas[:10]:
        print("  ", falha)


if __name__ == "__main__":
    main()

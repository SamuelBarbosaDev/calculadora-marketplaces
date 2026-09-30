# Recalcula js/historico.js a partir da planilha de vendas.
# Uso (na raiz do projeto):  pip install pandas openpyxl  &&  python scripts/gerar_historico.py "VENDAS PLATAFORMA.xlsx"
import sys, json
import pandas as pd
df=pd.read_excel(sys.argv[1] if len(sys.argv)>1 else 'VENDAS PLATAFORMA.xlsx',usecols=range(16))
df['P']=pd.to_numeric(df['PREÇO PAGO'],errors='coerce')
df=df[(df.P>0)&~df.Status.str.contains('Cancel',case=False,na=False)]
T='TAXA PLATAFORMA'
df=df[df[T].notna()]
df['ret']=df.P-df['PREÇO CUSTO']-df.FRETE-df['LUCRO R$']  # temu: retenção total
BANDS={'mercadolivre':[0,79,200,500,1e9],'shopee':[0,80,100,200,1e9],'tiktok':[0,50,200,1e9],'amazon':[0,79,200,1e9],'temu':[0,1e9]}
MAP={'mercadolivre':'MERCADO LIVRE','shopee':'SHOPEE','tiktok':'TIKTOK','amazon':'AMAZON','temu':'TEMU'}
out={}
for k,pl in MAP.items():
    g=df[df.PLATAFORMA==pl]
    if k=='temu': g=g.assign(**{T: g.ret-0.05*g.P})
    if k=='tiktok': g=g[g.DATA>='2026-07-15']
    b=BANDS[k]; bands=[]
    for lo,hi in zip(b[:-1],b[1:]):
        x=g[(g.P>=lo)&(g.P<hi)]
        if len(x)<20: continue
        bands.append({'min':lo,'max':None if hi>1e8 else hi,'taxa':round(x[T].sum()/x.P.sum(),4),'freteMediano':round(float(x.FRETE.median()),2),'n':int(len(x))})
    out[k]={'pedidos':int(len(df[df.PLATAFORMA==pl])),'receita':round(float(df[df.PLATAFORMA==pl].P.sum()),2),
      'taxaMedia':round(g[T].sum()/g.P.sum(),4),'freteMediano':round(float(g.FRETE.median()),2),
      'freteSobreVenda':round(g.FRETE.sum()/g.P.sum(),4),
      'margemMedia':round(float(df[df.PLATAFORMA==pl]['LUCRO R$'].sum()/df[df.PLATAFORMA==pl].P.sum()),4),
      'lucroSobreCusto':round(float(df[df.PLATAFORMA==pl]['LUCRO R$'].sum()/(df[df.PLATAFORMA==pl]['PREÇO CUSTO']*df[df.PLATAFORMA==pl]['QTD VENDIDA'].fillna(1)).sum()),4),
      'ticketMediano':round(float(g.P.median()),2),'faixas':bands}
    print(k, out[k]['taxaMedia'])
meta={'periodo':df.DATA.min().strftime('%d/%m/%Y')+' a '+df.DATA.max().strftime('%d/%m/%Y'),'linhas':int(len(df))}
open('js/historico.js','w').write('// Gerado a partir de "VENDAS PLATAFORMA.xlsx" ('+meta['periodo']+', '+str(meta['linhas'])+' pedidos).\n// Taxa = soma(TAXA PLATAFORMA) / soma(PREÇO PAGO) por faixa de preço.\nwindow.HISTORICO = '+json.dumps({'meta':meta,'plataformas':out},ensure_ascii=False,indent=2)+';\n')

#!/usr/bin/env python3
"""Gera public/bases/quimicos-base.json a partir de fontes abertas.

Fontes (todas buscadas a cada execução):
  - PubChem PUG REST (CID, fórmula, massa molar; confirmação do CAS)
  - NIOSH Pocket Guide to Chemical Hazards (páginas npgdXXXX.html)
  - NR-15 Anexo 11, Quadro n.º 1 (PDF oficial MTE; lido com `pdftotext -bbox`, se instalado)
  - LINACH (Portaria Interministerial MTE/MS/MPS n.º 9/2014; reprodução integral no site do CONASS)
  - IARC List of Classifications (dados embutidos em webapi.iarc.who.int/loc/loc.app.js)

Somente biblioteca padrão. Nenhum valor é preenchido de memória: o que não for
encontrado na fonte fica "" / null. Uso:  python3 -I tools/gerar_base_quimicos.py
"""
import html, json, os, re, shutil, ssl, subprocess, sys, tempfile, time, urllib.error, urllib.parse, urllib.request

DATA = "2026-11-11"
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAIDA = os.path.join(RAIZ, "public", "bases", "quimicos-base.json")
NPG = "https://www.cdc.gov/niosh/npg/"
NR15_URL = ("https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/"
            "comissao-tripartite-partitaria-permanente/arquivos/normas-regulamentadoras/nr-15-anexo-11.pdf")
LINACH_URL = "https://www.conass.org.br/?p=3726"
IARC_URL = "https://monographs.iarc.who.int/list-of-classifications/"
IARC_JS = "https://webapi.iarc.who.int/loc/loc.app.js"

_ca = os.environ.get("SSL_CERT_FILE") or ("/root/.ccr/ca-bundle.crt" if os.path.exists("/root/.ccr/ca-bundle.crt") else None)
CTX = ssl.create_default_context(cafile=_ca)


CACHE = os.environ.get("QUIMICOS_CACHE")  # opcional: diretório para guardar as respostas e evitar refazer downloads


def get(url, binary=False):
    """GET educado: 0,3 s entre requisições (2 s no cdc.gov); em 403/429/5xx espera e tenta de novo."""
    arq = os.path.join(CACHE, re.sub(r"[^A-Za-z0-9.]+", "_", url)[-150:]) if CACHE else None
    if arq and os.path.exists(arq):
        b = open(arq, "rb").read()
        return b if binary else b.decode("utf-8", "replace")
    erro = None
    for tentativa in range(3):
        time.sleep((2 if "cdc.gov" in url else 0.3) + 30 * tentativa)
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "gerar-base-quimicos/1.0 (Python-urllib)"})
            with urllib.request.urlopen(req, context=CTX, timeout=60) as r:
                b = r.read()
            if arq:
                os.makedirs(CACHE, exist_ok=True); open(arq, "wb").write(b)
            return b if binary else b.decode("utf-8", "replace")
        except urllib.error.HTTPError as e:  # 404 do PubChem = não encontrado
            if e.code == 404:
                return None
            erro = e
        except Exception as e:
            erro = e
    print("  falhou:", url, erro, file=sys.stderr)
    return None


def limpa(s):
    s = re.sub(r"<sup>(.*?)</sup>", lambda m: {"3": "³", "2": "²"}.get(m.group(1), m.group(1)), s, flags=re.I | re.S)
    s = re.sub(r"\s*<sub>(\d+)</sub>", lambda m: m.group(1).translate(str.maketrans("0123456789", "₀₁₂₃₄₅₆₇₈₉")), s, flags=re.I)
    s = re.sub(r"<br\s*/?>|<h6>", " ", s, flags=re.I)
    s = html.unescape(re.sub(r"<[^>]+>", " ", s))
    s = re.sub(r"\s+", " ", s).strip()
    return re.sub(r"\s+([,;:)])", r"\1", s).replace("( ", "(")


def f2c(s):
    def conv(m):
        a, b = m.group(1), m.group(2)
        c = lambda v: str(round((float(v) - 32) * 5 / 9))
        return f"{m.group(0)} ({c(a)}–{c(b)} °C)" if b else f"{m.group(0)} ({c(a)} °C)"
    return re.sub(r"(-?\d+(?:\.\d+)?)(?:\s*-\s*(-?\d+(?:\.\d+)?))?\s*°F", conv, s)


# ---------------------------------------------------------------- agentes
# npg: página NIOSH; nr15: início do nome da linha no Quadro n.º 1; linach: nome exato (prefixo) na LINACH;
# linachNota/iarcNota: entradas relacionadas apenas citadas em nota; iarc: nome da entrada IARC (quando não casa por CAS);
# iarcIgnora: True para não usar a entrada IARC encontrada pelo CAS.
OLEOS, DEF, TINTAS, SOLDA, COMB, ODONTO, PU, MEC = ("Óleos e graxas", "Defensivos agrícolas", "Tintas e solventes",
    "Fumos de soldagem", "Combustíveis", "Odontológicos", "Espuma de poliuretano", "Mecânica de veículos e máquinas")
INSET = "Inseticidas não arsenicais (exposição ocupacional na pulverização e aplicação)"
SOLDA_L, SOLDA_I = "Fumos de solda", "Welding fumes"
A = [
 dict(id="oleo-mineral-nevoa", nome="Óleo mineral (névoa)", sinonimos=["Névoa de óleo mineral", "Oil mist (mineral)", "Óleo de corte"], cas="8012-95-1", grupos=[OLEOS], tipo="mistura", npg="0472",
      linachNota=["Óleos minerais (não tratados ou pouco tratados)"], iarcNota=["Mineral oils, untreated or mildly treated", "Mineral oils, highly-refined"]),
 dict(id="querosene", nome="Querosene", sinonimos=["Kerosene", "Querosene de iluminação"], cas="8008-20-6", grupos=[OLEOS, MEC], tipo="mistura", npg="0366"),
 dict(id="solvente-stoddard", nome="Nafta / solvente Stoddard (aguarrás mineral)", sinonimos=["Aguarrás mineral", "Stoddard solvent", "White spirit", "Nafta mineral"], cas="8052-41-3", grupos=[OLEOS, MEC], tipo="mistura", npg="0569"),
 dict(id="glifosato", nome="Glifosato", sinonimos=["Glyphosate"], cas="1071-83-6", grupos=[DEF], tipo="substância"),
 dict(id="2-4-d", nome="2,4-D", sinonimos=["Ácido 2,4-diclorofenoxiacético", "2,4-Dichlorophenoxyacetic acid"], cas="94-75-7", grupos=[DEF], tipo="substância", npg="0173", linachNota=["Herbicidas clorofenoxi"]),
 dict(id="paraquat-dicloreto", nome="Paraquat (dicloreto)", sinonimos=["Dicloreto de paraquat", "Paraquat dichloride"], cas="1910-42-5", grupos=[DEF], tipo="substância", npg="0478"),
 dict(id="clorpirifos", nome="Clorpirifós", sinonimos=["Chlorpyrifos"], cas="2921-88-2", grupos=[DEF], tipo="substância", npg="0137", linachNota=[INSET]),
 dict(id="mancozebe", nome="Mancozebe", sinonimos=["Mancozeb"], cas="8018-01-7", grupos=[DEF], tipo="substância"),
 dict(id="atrazina", nome="Atrazina", sinonimos=["Atrazine"], cas="1912-24-9", grupos=[DEF], tipo="substância", npg="0043"),
 dict(id="malationa", nome="Malationa", sinonimos=["Malation", "Malathion"], cas="121-75-5", grupos=[DEF], tipo="substância", npg="0375", linachNota=[INSET]),
 dict(id="carbofurano", nome="Carbofurano", sinonimos=["Carbofuran"], cas="1563-66-2", grupos=[DEF], tipo="substância", npg="0101", linachNota=[INSET]),
 dict(id="cipermetrina", nome="Cipermetrina", sinonimos=["Cypermethrin"], cas="52315-07-8", grupos=[DEF], tipo="substância", linachNota=[INSET]),
 dict(id="acefato", nome="Acefato", sinonimos=["Acephate"], cas="30560-19-1", grupos=[DEF], tipo="substância", linachNota=[INSET]),
 dict(id="tolueno", nome="Tolueno", sinonimos=["Toluol", "Metilbenzeno", "Toluene"], cas="108-88-3", grupos=[TINTAS], tipo="substância", npg="0619", nr15="Tolueno (toluol)"),
 dict(id="xilenos", nome="Xilenos (mistura de isômeros)", sinonimos=["Xileno", "Xilol", "Xylenes", "Dimetilbenzeno"], cas="1330-20-7", grupos=[TINTAS], tipo="mistura", nr15="Xileno (xilol)",
      npgNota="O NIOSH Pocket Guide não tem página para a mistura; há páginas separadas para o-xileno (npgd0668), m-xileno (npgd0669) e p-xileno (npgd0670)."),
 dict(id="acetona", nome="Acetona", sinonimos=["Propanona", "Dimetilcetona", "Acetone"], cas="67-64-1", grupos=[TINTAS], tipo="substância", npg="0004", nr15="Acetona"),
 dict(id="metiletilcetona", nome="Metiletilcetona (MEK)", sinonimos=["Butanona", "2-Butanona", "MEK", "Methyl ethyl ketone"], cas="78-93-3", grupos=[TINTAS], tipo="substância", npg="0069", nr15="metil etil cetona"),
 dict(id="acetato-de-etila", nome="Acetato de etila", sinonimos=["Etanoato de etila", "Ethyl acetate"], cas="141-78-6", grupos=[TINTAS], tipo="substância", npg="0260", nr15="Acetato de etila"),
 dict(id="acetato-de-n-butila", nome="Acetato de n-butila", sinonimos=["Acetato de butila", "n-Butyl acetate"], cas="123-86-4", grupos=[TINTAS], tipo="substância", npg="0072"),
 dict(id="n-hexano", nome="n-Hexano", sinonimos=["Hexano", "n-Hexane"], cas="110-54-3", grupos=[TINTAS], tipo="substância", npg="0322"),
 dict(id="hdi", nome="HDI (hexametileno diisocianato)", sinonimos=["Diisocianato de hexametileno", "1,6-Hexametileno diisocianato", "Hexamethylene diisocyanate"], cas="822-06-0", grupos=[TINTAS], tipo="substância", npg="0320"),
 dict(id="dioxido-de-titanio", nome="Dióxido de titânio", sinonimos=["Titanium dioxide", "TiO2"], cas="13463-67-7", grupos=[TINTAS], tipo="substância", npg="0617", linach="Dióxido de titânio"),
 dict(id="tgic", nome="TGIC (isocianurato de triglicidila)", sinonimos=["Triglicidil isocianurato", "Triglycidyl isocyanurate"], cas="2451-62-9", grupos=[TINTAS], tipo="substância"),
 dict(id="cromo-vi-compostos", nome="Cromo VI – compostos", sinonimos=["Cromo hexavalente", "Cromato de zinco", "Ácido crômico e cromatos", "Chromium(VI) compounds"], cas="", grupos=[TINTAS, SOLDA], tipo="grupo/fumos", npg="0138",
      linach="Compostos de cromo (VI)", iarc="Chromium (VI) compounds", linachNota=[SOLDA_L], iarcNota=[SOLDA_I],
      npgNota="Página 'Chromic acid and chromates'; as propriedades físicas da página referem-se ao CrO₃ (trióxido de cromo), não ao cromato de zinco.",
      nr15obs="O Quadro n.º 1 não tem entrada genérica para compostos de cromo VI; consta 'Ácido crômico (névoa)' (ver PDF)."),
 dict(id="chumbo", nome="Chumbo", sinonimos=["Lead", "Pb"], cas="7439-92-1", grupos=[TINTAS], tipo="substância", npg="0368", nr15="Chumbo", linach="Chumbo|",
      linachNota=["Chumbo inorgânico, compostos de"], iarcNota=["Lead compounds, inorganic"]),
 dict(id="manganes-fumos", nome="Manganês (fumos)", sinonimos=["Fumos de manganês", "Manganese fume"], cas="7439-96-5", grupos=[SOLDA], tipo="grupo/fumos", npg="0379", linachNota=[SOLDA_L], iarcNota=[SOLDA_I]),
 dict(id="oxido-de-ferro-fumos", nome="Óxido de ferro (fumos)", sinonimos=["Fumos de óxido de ferro", "Iron oxide fume"], cas="1309-37-1", grupos=[SOLDA], tipo="grupo/fumos", npg="0344", linachNota=[SOLDA_L], iarcNota=[SOLDA_I]),
 dict(id="oxido-de-zinco-fumos", nome="Óxido de zinco (fumos)", sinonimos=["Fumos de óxido de zinco", "Zinc oxide fume"], cas="1314-13-2", grupos=[SOLDA], tipo="grupo/fumos", npg="0675", linachNota=[SOLDA_L], iarcNota=[SOLDA_I]),
 dict(id="niquel", nome="Níquel (metal e compostos)", sinonimos=["Nickel", "Ni"], cas="7440-02-0", grupos=[SOLDA], tipo="substância", npg="0445", linach="Níquel, metálico e ligas",
      linachNota=["Compostos de níquel", SOLDA_L], iarcNota=["Nickel compounds", SOLDA_I]),
 dict(id="monoxido-de-carbono", nome="Monóxido de carbono", sinonimos=["CO", "Carbon monoxide"], cas="630-08-0", grupos=[SOLDA], tipo="substância", npg="0105", nr15="Monóxido de carbono"),
 dict(id="dioxido-de-nitrogenio", nome="Dióxido de nitrogênio", sinonimos=["NO2", "Nitrogen dioxide"], cas="10102-44-0", grupos=[SOLDA], tipo="substância", npg="0454", nr15="Dióxido de nitrogênio"),
 dict(id="ozonio", nome="Ozônio", sinonimos=["Ozona", "O3", "Ozone"], cas="10028-15-6", grupos=[SOLDA], tipo="substância", npg="0476", nr15="Ozona"),
 dict(id="cadmio", nome="Cádmio", sinonimos=["Cadmium", "Cd"], cas="7440-43-9", grupos=[SOLDA], tipo="substância", npg="0087", linach="Cádmio e compostos de cádmio", linachNota=[SOLDA_L], iarcNota=[SOLDA_I],
      npgNota="Página usada: 'Cadmium dust (as Cd)'. O NIOSH tem página própria para 'Cadmium fume (as Cd)' (npgd0088, CAS 1306-19-0 CdO)."),
 dict(id="oleo-diesel", nome="Óleo diesel", sinonimos=["Diesel", "Diesel fuel", "Gasóleo"], cas="68334-30-5", grupos=[COMB], tipo="mistura",
      linachNota=["Exaustão do motor diesel", "Óleo diesel marítimo"], iarcNota=["Diesel fuels, distillate (light)", "Diesel fuel, marine", "Engine exhaust, diesel"],
      npgNota="O NIOSH Pocket Guide não tem página para óleo diesel."),
 dict(id="gasolina", nome="Gasolina", sinonimos=["Gasoline", "Petrol"], cas="8006-61-9", grupos=[COMB], tipo="mistura", npg="0299", linach="Gasolina", iarc="Automotive gasoline"),
 dict(id="etanol", nome="Etanol", sinonimos=["Álcool etílico", "Ethanol", "Ethyl alcohol"], cas="64-17-5", grupos=[COMB], tipo="substância", npg="0262", nr15="Álcool etílico", iarcIgnora=True,
      linachNota=["Etanol em bebidas alcoólicas"], iarcNota=["Ethanol in alcoholic beverages"]),
 dict(id="metanol", nome="Metanol", sinonimos=["Álcool metílico", "Methanol", "Methyl alcohol"], cas="67-56-1", grupos=[COMB], tipo="substância", npg="0397", nr15="Álcool metílico"),
 dict(id="benzeno", nome="Benzeno", sinonimos=["Benzol", "Benzene"], cas="71-43-2", grupos=[COMB], tipo="substância", npg="0049", nr15="Benzeno", linach="Benzeno|"),
 dict(id="mercurio", nome="Mercúrio (elementar)", sinonimos=["Mercúrio metálico", "Mercury", "Hg"], cas="7439-97-6", grupos=[ODONTO], tipo="substância", npg="0383", nr15="Mercúrio (todas as formas exceto orgânicas)"),
 dict(id="glutaraldeido", nome="Glutaraldeído", sinonimos=["Glutaral", "Glutaraldehyde"], cas="111-30-8", grupos=[ODONTO], tipo="substância", npg="0301"),
 dict(id="formaldeido", nome="Formaldeído", sinonimos=["Formol", "Aldeído fórmico", "Formaldehyde"], cas="50-00-0", grupos=[ODONTO], tipo="substância", npg="0293", nr15="Formaldeído (formol)", linach="Formaldeído"),
 dict(id="metacrilato-de-metila", nome="Metacrilato de metila", sinonimos=["MMA", "Methyl methacrylate"], cas="80-62-6", grupos=[ODONTO], tipo="substância", npg="0426", nr15="Metacrilato de metila"),
 dict(id="oxido-nitroso", nome="Óxido nitroso", sinonimos=["N2O", "Gás hilariante", "Nitrous oxide"], cas="10024-97-2", grupos=[ODONTO], tipo="substância", npg="0465", nr15="Óxido nitroso"),
 dict(id="peroxido-de-hidrogenio", nome="Peróxido de hidrogênio", sinonimos=["Água oxigenada", "Hydrogen peroxide"], cas="7722-84-1", grupos=[ODONTO], tipo="substância", npg="0335"),
 dict(id="hipoclorito-de-sodio", nome="Hipoclorito de sódio", sinonimos=["Água sanitária", "Sodium hypochlorite"], cas="7681-52-9", grupos=[ODONTO], tipo="substância", iarc="Hypochlorite salts"),
 dict(id="acido-fosforico", nome="Ácido fosfórico", sinonimos=["Ácido ortofosfórico", "Phosphoric acid"], cas="7664-38-2", grupos=[ODONTO], tipo="substância", npg="0506"),
 dict(id="mdi", nome="MDI (difenilmetano diisocianato)", sinonimos=["4,4'-Difenilmetano diisocianato", "Methylene bisphenyl isocyanate", "Methylene diphenyl diisocyanate"], cas="101-68-8", grupos=[PU], tipo="substância", npg="0413"),
 dict(id="tdi", nome="TDI (2,4-tolueno diisocianato)", sinonimos=["2,4-TDI", "Diisocianato de tolueno", "Toluene-2,4-diisocyanate"], cas="584-84-9", grupos=[PU], tipo="substância", npg="0621", nr15="2,4 Diisocianato de tolueno (TDI)",
      linach="Diisocianatos de tolueno", iarc="Toluene diisocyanates"),
 dict(id="ciclopentano", nome="Ciclopentano", sinonimos=["Cyclopentane"], cas="287-92-3", grupos=[PU], tipo="substância", npg="0171"),
 dict(id="hcfc-141b", nome="HCFC-141b (1,1-dicloro-1-fluoroetano)", sinonimos=["R-141b", "1,1-Dichloro-1-fluoroethane"], cas="1717-00-6", grupos=[PU], tipo="substância"),
 dict(id="trietilenodiamina", nome="Trietilenodiamina", sinonimos=["TEDA", "DABCO", "1,4-Diazabiciclo[2.2.2]octano", "Triethylenediamine"], cas="280-57-9", grupos=[PU], tipo="substância"),
 dict(id="etilenoglicol", nome="Etilenoglicol", sinonimos=["Monoetilenoglicol", "MEG", "Ethylene glycol"], cas="107-21-1", grupos=[MEC], tipo="substância", npg="0272"),
 dict(id="dietilenoglicol", nome="Dietilenoglicol", sinonimos=["DEG", "Diethylene glycol"], cas="111-46-6", grupos=[MEC], tipo="substância"),
 dict(id="propilenoglicol", nome="Propilenoglicol", sinonimos=["1,2-Propanodiol", "Propylene glycol"], cas="57-55-6", grupos=[MEC], tipo="substância"),
 dict(id="amianto", nome="Asbesto / amianto", sinonimos=["Amianto", "Asbestos", "Crisotila"], cas="1332-21-4", grupos=[MEC], tipo="grupo/fumos", npg="0041", linach="Asbestos  ou amianto"),
 dict(id="acido-sulfurico", nome="Ácido sulfúrico", sinonimos=["Sulfuric acid", "Óleo de vitríolo"], cas="7664-93-9", grupos=[MEC], tipo="substância", npg="0577", iarcNota=["Acid mists, strong inorganic"]),
 dict(id="tricloroetileno", nome="Tricloroetileno", sinonimos=["TCE", "Tricloroeteno", "Trichloroethylene"], cas="79-01-6", grupos=[MEC], tipo="substância", npg="0629", nr15="Tricloroetileno", linach="Tricloroetileno"),
 dict(id="diclorometano", nome="Diclorometano", sinonimos=["Cloreto de metileno", "Methylene chloride", "Dichloromethane"], cas="75-09-2", grupos=[MEC], tipo="substância", npg="0414", nr15="Cloreto de metileno",
      linach="Diclorometano (cloreto de metileno)"),
]

FIS = {"Physical Description": "estado", "Boiling Point": "pontoEbulicao", "Freezing Point": "pontoFusao", "Melting Point": "pontoFusao",
       "Vapor Pressure": "pressaoVapor", "Specific Gravity": "densidadeRelativa", "Relative Gas Density": "densidadeVapor",
       "Solubility": "solubilidadeAgua", "Flash Point": "pontoFulgor", "Lower Explosive Limit": "lie", "Upper Explosive Limit": "lse"}
CONV = {"pontoEbulicao", "pontoFusao", "pontoFulgor"}


def niosh(pid):
    url = f"{NPG}npgd{pid}.html"
    t = get(url)
    if not t:
        return None
    c = {}
    for k, v in re.findall(r"card-title h6['\"]>(.*?)</div>\s*<div class=['\"]card-body['\"]>\s*<div class=['\"]card-text['\"]>(.*?)</div>", t, re.S | re.I):
        c.setdefault(limpa(k), v)
    lim = c.get("Exposure Limits", "")
    rel = re.search(r"NIOSH REL</h6>(.*?)(?:<h6>|$)", lim, re.S)
    pel = re.search(r"OSHA PEL</h6>(.*?)$", lim, re.S)
    met = re.sub(r"\s*See:\s*NMAM or OSHA Methods\s*$", "", limpa(c.get("Measurement Methods", "")))
    fis = {}
    for k, campo in FIS.items():
        if k in c and not fis.get(campo):
            v = limpa(c[k])
            fis[campo] = f2c(v) if campo in CONV else v
    return dict(url=url, nome=limpa(re.search(r"<title>(.*?)</title>", t, re.S).group(1)).split(" - ")[-1].strip(),
                cas=limpa(c.get("CAS No.", "")), mw=limpa(c.get("Molecular Weight", "")), fis=fis,
                rel=re.sub(r"^NIOSH REL:\s*", "", limpa(rel.group(1))) if rel else "", pel=limpa(pel.group(1)) if pel else "",
                idlh=re.sub(r"\s*See:.*$", "", limpa(c.get("IDLH", ""))), metodos=met,
                vias=limpa(c.get("Exposure Routes", "")), orgaos=limpa(c.get("Target Organs", "")), sint=limpa(c.get("Symptoms", "")))


def pubchem(cas):
    q = urllib.parse.quote(cas)
    j = get(f"https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/{q}/property/Title,MolecularFormula,MolecularWeight/JSON")
    if j:
        p = json.loads(j)["PropertyTable"]["Properties"][0]
        return dict(cid=p["CID"], titulo=p.get("Title", ""), formula=p.get("MolecularFormula", ""), mw=str(p.get("MolecularWeight", "")))
    j = get(f"https://pubchem.ncbi.nlm.nih.gov/rest/pug/substance/name/{q}/sids/JSON")
    if j:
        return dict(sid=json.loads(j)["IdentifierList"]["SID"][0])
    return None


def nr15_linhas():
    """Linhas do Quadro n.º 1 via pdftotext -bbox (coordenadas: '+' em x<300 = valor teto, x>=300 = pele)."""
    pdf = get(NR15_URL, binary=True)
    if not pdf or not shutil.which("pdftotext"):
        return None
    with tempfile.TemporaryDirectory() as d:
        p = os.path.join(d, "a11.pdf"); open(p, "wb").write(pdf)
        subprocess.run(["pdftotext", "-bbox", p, p + ".html"], check=True)
        t = open(p + ".html", encoding="utf-8").read()
    linhas = []
    for pag in t.split("<page ")[1:]:
        rows = {}
        for x, y, w in re.findall(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="[\d.]+" yMax="[\d.]+">([^<]*)</word>', pag):
            rows.setdefault(round(float(y)), []).append((float(x), html.unescape(w)))
        for y in sorted(rows):
            ws = sorted(rows[y])
            nome = " ".join(w for x, w in ws if x < 240)
            resto = [(x, w) for x, w in ws if x >= 240]
            linhas.append(dict(nome=nome, texto=" ".join(w for _, w in ws), teto=any(w == "+" and x < 300 for x, w in resto),
                               pele=any(w == "+" and x >= 300 for x, w in resto), vals=[w for x, w in resto if x >= 345]))
    return linhas


def linach_grupos():
    t = get(LINACH_URL)
    if not t:
        return None
    t = re.sub(r"<script.*?</script>|<style.*?</style>", "", t, flags=re.S)
    s = html.unescape(re.sub(r"<[^>]+>", "|", t))
    s = re.sub(r"(\|\s*)+", "|", s)
    s = s[s.find("Grupo 1 – Agentes"):s.find("|Notas:|")]
    return s, [(m.start(), m.group(1)) for m in re.finditer(r"Grupo (1|2A|2B) – Agentes", s)]


def linach_busca(L, nome):
    s, gs = L
    alvo = "|" + nome if nome.endswith("|") else "|" + nome
    i = s.find(alvo)
    if i < 0:
        return ""
    return "Grupo " + [g for p, g in gs if p <= i][-1]


def iarc_lista():
    t = get(IARC_JS)
    if not t:
        return None
    out = []
    for nome, grp, cas in re.findall(r'\{name:"((?:[^"\\]|\\.)*)",group:"([^"]+)"(?:,cas:\[([^\]]*)\])?', t):
        out.append(dict(nome=re.sub(r"<[^>]+>", "", nome), grupo=grp, cas=re.findall(r'"([^"]+)"', cas or "")))
    return out


def fonte(campos, ref, url, nota=None):
    f = {"campos": campos, "referencia": ref, "url": url, "consultadoEm": DATA}
    if nota:
        f["nota"] = nota
    return f


def main():
    print("NR-15 Anexo 11…"); NR = nr15_linhas()
    print("LINACH…"); L = linach_grupos()
    print("IARC…"); IA = iarc_lista()
    saida, avisos = [], []
    for a in A:
        print(a["id"])
        fontes, cas = [], a["cas"]
        ag = {k: a[k] for k in ("id", "nome", "sinonimos")}
        pc = pubchem(cas) if cas else None
        ni = niosh(a["npg"]) if a.get("npg") else None
        # --- confirmação do CAS
        ok_pc = bool(pc)
        ok_ni = bool(ni and cas and re.search(r"(^|[\s;,])" + re.escape(cas) + r"\b", ni["cas"]))
        if ni and cas and not ok_ni:
            avisos.append(f"{a['id']}: CAS {cas} não aparece na página NIOSH (CAS NIOSH: {ni['cas']})")
        if cas and not (ok_pc or ok_ni):
            avisos.append(f"{a['id']}: CAS {cas} não confirmado; deixado em branco"); cas = ""
        ag.update(cas=cas, grupos=a["grupos"], tipo=a["tipo"], formula="", massaMolar="")
        if pc and "cid" in pc:
            ag["formula"], ag["massaMolar"] = pc["formula"], pc["mw"] + " g/mol"
            fontes.append(fonte("identificação (CAS), fórmula e massa molar", f"PubChem, CID {pc['cid']} ({pc['titulo']})",
                                f"https://pubchem.ncbi.nlm.nih.gov/compound/{pc['cid']}"))
        elif pc:
            fontes.append(fonte("confirmação do CAS", f"PubChem Substance, SID {pc['sid']} (CAS registrado como sinônimo; sem registro em PubChem Compound)",
                                f"https://pubchem.ncbi.nlm.nih.gov/substance/{pc['sid']}"))
        fis = dict.fromkeys(["estado", "pontoEbulicao", "pontoFusao", "pressaoVapor", "densidadeRelativa", "densidadeVapor", "solubilidadeAgua",
                             "pontoFulgor", "lie", "lse", "autoignicao", "limiarOdor"], "")
        nio = dict.fromkeys(["rel", "idlh", "oshaPel", "vias", "orgaosAlvo", "sintomas", "metodos", "url"], "")
        if ni:
            fis.update(ni["fis"])
            nio.update(rel=ni["rel"], idlh=ni["idlh"], oshaPel=ni["pel"], vias=ni["vias"], orgaosAlvo=ni["orgaos"], sintomas=ni["sint"], metodos=ni["metodos"], url=ni["url"])
            if not ag["massaMolar"] and ni["mw"] and a["tipo"] != "grupo/fumos":
                ag["massaMolar"] = ni["mw"] + " (NIOSH)"
            fontes.append(fonte("propriedades físico-químicas e bloco niosh", f"NIOSH Pocket Guide to Chemical Hazards – {ni['nome']} (CAS na página: {ni['cas']})",
                                ni["url"], a.get("npgNota")))
        elif a.get("npgNota"):
            fontes.append(fonte("bloco niosh", "NIOSH Pocket Guide to Chemical Hazards", NPG + "npgdcas.html", a["npgNota"]))
        ag["fisico"], ag["niosh"] = fis, nio
        # --- NR-15
        nr = {"anexo11": None, "observacao": ""}
        if NR is None:
            nr["observacao"] = "Quadro n.º 1 não processado nesta execução (PDF ou pdftotext indisponível)."
        elif a.get("nr15"):
            m = [l for l in NR if l["nome"].startswith(a["nr15"])]
            if len(m) != 1:
                nr["observacao"] = f"Linha '{a['nr15']}' não identificada de forma única no Quadro n.º 1."
                avisos.append(f"{a['id']}: NR-15 ambíguo ({len(m)} linhas)")
            else:
                l, v = m[0], m[0]["vals"]
                if "Excluído" in l["texto"]:
                    nr["observacao"] = "Quadro n.º 1: " + l["texto"]
                elif v and v[0].lower().startswith(("asfixiante", "axfixiante", "asfixante")):
                    nr["observacao"] = "Quadro n.º 1: 'Asfixiante simples' (item 3 do Anexo 11: concentração mínima de oxigênio de 18% em volume)."
                elif len(v) >= 3:
                    g = v[-1].replace("maximo", "máximo")
                    nr["anexo11"] = dict(ppm=v[0] if v[0] not in "-_" else "", mgm3=v[1] if v[1] not in "-_" else "", grau=g, pele=l["pele"], teto=l["teto"])
                    nr["observacao"] = f"Linha do Quadro n.º 1: '{l['nome']}'."
                else:
                    nr["observacao"] = "Linha localizada mas não interpretada: " + l["texto"]
            fontes.append(fonte("nr15", "NR-15, Anexo n.º 11, Quadro n.º 1 (MTE)", NR15_URL))
        else:
            nr["observacao"] = a.get("nr15obs") or "Não localizado no Quadro n.º 1 do Anexo 11 (busca pelo nome)."
            fontes.append(fonte("nr15", "NR-15, Anexo n.º 11, Quadro n.º 1 (MTE)", NR15_URL))
        ag["nr15"] = nr
        # --- LINACH
        ag["linach"], notas = "", []
        if L:
            if a.get("linach"):
                ag["linach"] = linach_busca(L, a["linach"])
                if not ag["linach"]:
                    avisos.append(f"{a['id']}: '{a['linach']}' não achado na LINACH")
            for n in a.get("linachNota", []):
                g = linach_busca(L, n)
                if g:
                    notas.append(f"'{n}' – {g}")
            fontes.append(fonte("linach", "Portaria Interministerial MTE/MS/MPS n.º 9, de 07/10/2014 (DOU 08/10/2014) – LINACH; texto reproduzido pelo CONASS",
                                LINACH_URL, ("Entradas relacionadas (não atribuídas ao agente): " + "; ".join(notas)) if notas else
                                (None if ag["linach"] else "Agente não localizado na lista (busca pelo nome).")))
        # --- IARC
        ag["iarc"], notas = "", []
        if IA:
            hit = None
            if a.get("iarc"):
                hit = next((e for e in IA if e["nome"].startswith(a["iarc"])), None)
            elif cas and not a.get("iarcIgnora"):
                hs = [e for e in IA if cas in e["cas"]]
                hit = hs[0] if len(hs) == 1 else None
                if len(hs) > 1:
                    avisos.append(f"{a['id']}: várias entradas IARC com o CAS")
            if hit:
                ag["iarc"] = "Grupo " + hit["grupo"]
            for n in a.get("iarcNota", []):
                e = next((e for e in IA if e["nome"].startswith(n)), None)
                if e:
                    notas.append(f"'{e['nome']}' – Grupo {e['grupo']}")
            nota = (f"Entrada usada: '{hit['nome']}'. " if hit else "Nenhuma entrada atribuída ao agente. ") + \
                   (("Entradas relacionadas (não atribuídas ao agente): " + "; ".join(notas)) if notas else "")
            fontes.append(fonte("iarc", "IARC Monographs – List of Classifications", IARC_URL, nota.strip()))
        ag["fontes"], ag["situacao"] = fontes, "A conferir"
        saida.append(ag)
    os.makedirs(os.path.dirname(SAIDA), exist_ok=True)
    with open(SAIDA, "w", encoding="utf-8") as f:
        json.dump({"versao": DATA, "descricao": "Base inicial de agentes químicos – fontes abertas; conferir antes de usar em laudo", "agentes": saida},
                  f, ensure_ascii=False, indent=1)
    print(f"\n{len(saida)} agentes gravados em {SAIDA}")
    for x in avisos:
        print("AVISO:", x)


if __name__ == "__main__":
    main()

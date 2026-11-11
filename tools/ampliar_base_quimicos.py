#!/usr/bin/env python3
"""Amplia public/bases/quimicos-base.json com os agentes dos decretos previdenciários e
classifica todos os agentes pelos Anexos 11, 12, 13 e 13-A da NR-15.

Roda DEPOIS de gerar_base_quimicos.py (que monta os 58 agentes iniciais). É idempotente:
os agentes novos são reconstruídos a cada execução e a classificação NR-15 é refeita para todos.

Fontes (arquivos em tools/dados/, todos com a origem registrada no próprio arquivo):
  - niosh-npg-novos-2026-11-11.json  NIOSH Pocket Guide, páginas npgdXXXX (campos copiados da página)
  - nr15-anexo11-quadro1.json        NR-15, Anexo 11, Quadro n.º 1
  - nr15-anexo13.json                NR-15, Anexo 13 (atividades e graus)
  - linach-grupo1.json               LINACH, Grupo 1
  - decretos-quimicos.json           Decretos 53.831/64, 83.080/79 e 3.048/99 (códigos 1.2.x e 1.0.x)
  - Anexo 12 da NR-15: texto do PDF oficial do MTE (itens citados em ANEXO12, abaixo)

Nenhum valor é preenchido de memória: o que não está nas fontes fica "" e o agente entra "A conferir".
Uso:  python3 -I tools/ampliar_base_quimicos.py
"""
import json, os, re, unicodedata

DATA = "2026-11-11"
VERSAO = "2026-11-15"  # maior que a versão anterior (2026-11-14), para a base atualizar o banco do app
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = os.path.join(RAIZ, "public", "bases", "quimicos-base.json")
DADOS = os.path.join(RAIZ, "tools", "dados")
NPG = "https://www.cdc.gov/niosh/npg/"
NR15_PDF = "https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/arquivos/normas-regulamentadoras/nr-15-anexo-{}.pdf"


def ler(nome):
    with open(os.path.join(DADOS, nome), encoding="utf-8") as f:
        return json.load(f)


def sem_acento(s):
    return "".join(c for c in unicodedata.normalize("NFD", str(s).lower()) if unicodedata.category(c) != "Mn")


NIOSH = ler("niosh-npg-novos-2026-11-11.json")
A11 = ler("nr15-anexo11-quadro1.json")["linhas"]
A13 = ler("nr15-anexo13.json")["linhas"]
LINACH1 = ler("linach-grupo1.json")["agentes"]

# ------------------------------------------------------------------ grupos de uso
OLEOS, DEF, TINTAS, SOLDA, COMB, ODONTO, PU, MEC = ("Óleos e graxas", "Defensivos agrícolas", "Tintas e solventes",
    "Fumos de soldagem", "Combustíveis", "Odontológicos", "Espuma de poliuretano", "Mecânica de veículos e máquinas")
MET, POE, HAL, GAS, BOR, CAN, ACI, MED = ("Metais e compostos", "Poeiras minerais", "Halogênios e organoclorados", "Gases e vapores",
    "Borracha e plásticos", "Cancerígenos e aminas aromáticas", "Ácidos e álcalis", "Medicamentos (Anexo IV, 1.0.19)")

# ------------------------------------------------------------------ decretos
T53 = {"1.2.1": "ARSÊNICO", "1.2.2": "BERÍLIO", "1.2.3": "CÁDMIO", "1.2.4": "CHUMBO", "1.2.5": "CROMO", "1.2.6": "FÓSFORO",
       "1.2.7": "MANGANÊS", "1.2.8": "MERCÚRIO", "1.2.9": "OUTROS TÓXICOS INORGÂNICOS", "1.2.10": "POEIRAS MINERAIS NOCIVAS",
       "1.2.11": "TÓXICOS ORGÂNICOS"}
T83 = {"1.2.1": "ARSÊNICO", "1.2.2": "BERÍLIO OU GLICÍNIO", "1.2.3": "CÁDMIO", "1.2.4": "CHUMBO", "1.2.5": "CROMO", "1.2.6": "FÓSFORO",
       "1.2.7": "MANGANÊS", "1.2.8": "MERCÚRIO", "1.2.9": "OURO", "1.2.10": "HIDROCARBONETOS E OUTROS COMPOSTOS DE CARBONO",
       "1.2.11": "OUTROS TÓXICOS, ASSOCIAÇÃO DE AGENTES", "1.2.12": "SÍLICA, SILICATOS, CARVÃO, CIMENTO E AMIANTO"}
TIV = {"1.0.1": "ARSÊNIO E SEUS COMPOSTOS", "1.0.2": "ASBESTOS", "1.0.3": "BENZENO E SEUS COMPOSTOS TÓXICOS",
       "1.0.4": "BERÍLIO E SEUS COMPOSTOS TÓXICOS", "1.0.5": "BROMO E SEUS COMPOSTOS TÓXICOS", "1.0.6": "CÁDMIO E SEUS COMPOSTOS TÓXICOS",
       "1.0.7": "CARVÃO MINERAL E SEUS DERIVADOS", "1.0.8": "CHUMBO E SEUS COMPOSTOS TÓXICOS", "1.0.9": "CLORO E SEUS COMPOSTOS TÓXICOS",
       "1.0.10": "CROMO E SEUS COMPOSTOS TÓXICOS", "1.0.11": "DISSULFETO DE CARBONO", "1.0.12": "FÓSFORO E SEUS COMPOSTOS TÓXICOS",
       "1.0.13": "IODO", "1.0.14": "MANGANÊS E SEUS COMPOSTOS", "1.0.15": "MERCÚRIO E SEUS COMPOSTOS",
       "1.0.16": "NÍQUEL E SEUS COMPOSTOS TÓXICOS", "1.0.17": "PETRÓLEO, XISTO BETUMINOSO, GÁS NATURAL E SEUS DERIVADOS",
       "1.0.18": "SÍLICA LIVRE", "1.0.19": "OUTRAS SUBSTÂNCIAS QUÍMICAS"}
QUAL = {"fam": " (por família – conferir a atividade listada no código)", "classe": " (pela classe química do código – conferir)"}


def cods(lista, titulos):
    """lista: ["1.2.4", "1.2.11:classe", "1.0.19:Grupo II"] → texto"""
    if not lista:
        return "sem código específico"
    out = []
    for c in lista:
        cod, _, q = c.partition(":")
        t = f"{cod} – {titulos[cod]}"
        if q in QUAL:
            t += QUAL[q]
        elif q:
            t += f" ({q})"
        out.append(t)
    return "; ".join(out)


def texto_decretos(d53, d83, div):
    return "\n".join([f"Dec. 53.831/1964: {cods(d53, T53)}", f"Dec. 83.080/1979: {cods(d83, T83)}",
                      f"Dec. 2.172/1997: {cods(div, TIV)}", f"Dec. 3.048/1999: {cods(div, TIV)}"])


# ------------------------------------------------------------------ NR-15
ANEXO12 = {
    "asbesto": "Anexo 12 – Asbesto: limite de tolerância para fibras respiráveis de asbesto crisotila = 2,0 f/cm³ (item 12); "
               "proibida a utilização de asbesto do grupo anfibólio e de produtos que o contenham (item 4). O texto do anexo não fixa grau para o asbesto.",
    "manganes-poeira": "Anexo 12 – Manganês e compostos (poeiras: extração, tratamento, moagem, transporte do minério e outras operações): "
                       "LT até 5 mg/m³ para jornada de até 8 h/dia (item 1); ultrapassado o limite, insalubridade de grau máximo (item 3).",
    "manganes-fumos": "Anexo 12 – Manganês e compostos (fumos: metalurgia, ligas, eletrodos de solda, baterias, vidros, cerâmicas, tintas, fertilizantes e outras): "
                      "LT até 1 mg/m³ para jornada de até 8 h/dia (item 2); ultrapassado o limite, insalubridade de grau máximo (item 3).",
    "silica": "Anexo 12 – Sílica livre cristalizada (quartzo): poeira respirável LT = 8 / (% quartzo + 2) mg/m³ (item 2); poeira total LT = 24 / (% quartzo + 3) mg/m³ (item 4); "
              "contagem LT = 8,5 / (% quartzo + 10) mppdc (item 1). % de quartzo e concentração pela fração do seletor do Quadro n.º 1 (item 3); limites para até 48 h semanais (item 6). "
              "O texto do anexo não fixa grau para a sílica.",
}


def a13_linhas(sel):
    """sel: [("CHUMBO", None)] = todas as atividades do agente; [("OPERAÇÕES DIVERSAS", "cádmio")] = só as que contêm o trecho."""
    out = []
    for ag, trecho in sel:
        for l in A13:
            if not sem_acento(l["agente"]).startswith(sem_acento(ag)):
                continue
            if trecho and sem_acento(trecho) not in sem_acento(l["atividade"]):
                continue
            if l["grau"] == "nota":
                continue
            out.append(l)
    return out


def a11_linha(nome):
    m = [l for l in A11 if sem_acento(l["n"]) == sem_acento(nome)]
    if len(m) != 1:
        raise SystemExit(f"Anexo 11: '{nome}' não encontrado de forma única")
    return m[0]


def fmt_num(v):
    return "" if v is None else (str(int(v)) if float(v).is_integer() else str(v)).replace(".", ",")


def classificar(ag, regra, obs_ant=""):
    """Monta ag['nr15'] = {anexo11, anexos, anexo12, anexo13, observacao}."""
    nr = ag.get("nr15") or {}
    a11 = nr.get("anexo11")
    partes, anexos = [], []
    if regra.get("a11"):
        l = a11_linha(regra["a11"])
        if l.get("obs"):
            partes.append(f"Anexo 11, Quadro n.º 1: '{l['n']}' – {l['obs']} (item 3).")
            anexos.append("11")
        else:
            a11 = dict(ppm=fmt_num(l["ppm"]), mgm3=fmt_num(l["mg"]), grau=l["g"], pele=bool(l["pele"]), teto=bool(l["teto"]))
            partes.append(f"Linha do Quadro n.º 1: '{l['n']}'.")
    elif obs_ant:
        partes.append(obs_ant)
        if "Asfixiante simples" in obs_ant:
            anexos.append("11")
    if a11:
        anexos.append("11")
    if regra.get("a12"):
        anexos.append("12")
        partes.append(ANEXO12[regra["a12"]])
    ls = a13_linhas(regra.get("a13", []))
    vivas = [l for l in ls if not l["excluido"]]
    if vivas:
        anexos.append("13")
        grupos = {}
        for l in vivas:
            grupos.setdefault(l["agente"], []).append(f"{l['atividade']} [{'proibida qualquer exposição' if l['grau'] == 'proibido' else 'grau ' + l['grau']}]")
        for g, at in grupos.items():
            partes.append(f"Anexo 13 – {g.capitalize() if g.isupper() else g}: " + " ".join(at))
    for l in ls:
        if l["excluido"]:
            partes.append(f"Anexo 13 – item excluído: {l['atividade']}")
    if regra.get("a13a"):
        anexos.append("13-A")
        partes.append("Anexo 13-A (benzeno): avaliação qualitativa; VRT-MPT (Valor de Referência Tecnológico) para monitoramento, não é limite de tolerância. "
                      "Não se aplica ao armazenamento, transporte, distribuição, venda e uso de combustíveis derivados de petróleo (item 2 do anexo) – conferir no texto.")
    if regra.get("nota"):
        partes.append(regra["nota"])
    if not anexos:
        partes.append("Não consta dos Anexos 11, 12, 13 ou 13-A da NR-15 (sem enquadramento trabalhista por esses anexos).")
    ordem = ["11", "12", "13", "13-A"]
    nr = {"anexo11": a11, "anexos": sorted(set(anexos), key=ordem.index), "observacao": " ".join(partes)}
    if obs_ant and not regra.get("a11"):
        nr["quadro1"] = obs_ant  # observação original do Quadro n.º 1 (preservada para novas execuções)
    ag["nr15"] = nr
    fontes = [f for f in ag.get("fontes", []) if f.get("campos") not in ("nr15", "nr15 – anexos 11, 12, 13 e 13-A")]
    ref = "NR-15 (MTE), Anexo n.º 11 (Quadro n.º 1), Anexo n.º 12, Anexo n.º 13 e Anexo n.º 13-A"
    nota = []
    if "11" in anexos or regra.get("a11"):
        nota.append("Anexo 11: " + ("PDF oficial (leitura automática)" if not regra.get("a11") else "transcrição do Quadro n.º 1 em tools/dados/nr15-anexo11-quadro1.json"))
    if "12" in anexos:
        nota.append("Anexo 12: PDF oficial do MTE, itens citados")
    if "13" in anexos:
        nota.append("Anexo 13: transcrição em tools/dados/nr15-anexo13.json")
    fontes.append({"campos": "nr15 – anexos 11, 12, 13 e 13-A", "referencia": ref, "url": NR15_PDF.format("11"), "consultadoEm": DATA,
                   **({"nota": "; ".join(nota)} if nota else {})})
    ag["fontes"] = fontes


# ------------------------------------------------------------------ classificação dos 58 agentes já existentes
HC, FOSF, OPD, CANC = "HIDROCARBONETOS", "FÓSFORO", "OPERAÇÕES DIVERSAS", "SUBSTÂNCIAS CANCERÍGENAS"
AROM = [(HC, "pistola com esmaltes"), (HC, "hidrocarbonetos aromáticos como solventes"), (HC, "pincel com esmaltes")]
ORGFOSF = [(FOSF, "organofosforados")]
CARBAM = [(HC, "derivados do ácido carbônico")]
EXIST = {
    "oleo-mineral-nevoa": dict(a13=[(HC, "óleos minerais")]),
    "querosene": dict(a13=[(HC, "hidrocarbonetos aromáticos como solventes")], nota="Anexo 13: só se o produto contiver hidrocarbonetos aromáticos (conferir a FISPQ)."),
    "solvente-stoddard": dict(a13=[(HC, "hidrocarbonetos aromáticos como solventes")], nota="Anexo 13: só se o produto contiver hidrocarbonetos aromáticos (conferir a FISPQ)."),
    "glifosato": dict(a13=ORGFOSF, nota="Anexo 13 (fósforo): glifosato é organofosforado do tipo fosfonato – enquadramento por família, conferir."),
    "clorpirifos": dict(a13=ORGFOSF), "malationa": dict(a13=ORGFOSF), "acefato": dict(a13=ORGFOSF),
    "mancozebe": dict(a13=CARBAM, nota="Anexo 13: ditiocarbamato – enquadramento por família (derivados do ácido carbônico), conferir."),
    "carbofurano": dict(a13=CARBAM),
    "tolueno": dict(a13=AROM), "xilenos": dict(a13=AROM),
    "hdi": dict(a13=[(HC, "isocianatos")]), "mdi": dict(a13=[(HC, "isocianatos")]), "tdi": dict(a13=[(HC, "isocianatos")]),
    "cromo-vi-compostos": dict(a13=[("CROMO", None)]),
    "chumbo": dict(a13=[("CHUMBO", None)]),
    "manganes-fumos": dict(a12="manganes-fumos", a13=[(OPD, "manganês")]),
    "niquel": dict(a13=[(OPD, "níquel"), (OPD, "galvanoplastia")]),
    "cadmio": dict(a13=[(OPD, "cádmio")]),
    "oleo-diesel": dict(a13=[(HC, "óleo diesel")]),
    "gasolina": dict(a13=[("CHUMBO", "gasolina")], nota="Anexo 13 (chumbo): só gasolina com chumbo tetraetila. Benzeno da gasolina: o Anexo 13-A não se aplica ao uso e à distribuição de combustíveis derivados de petróleo (conferir)."),
    "benzeno": dict(a13a=True, nota="Anexo 13 (substâncias cancerígenas): remete o benzeno ao Anexo 13-A."),
    "mercurio": dict(a13=[("MERCÚRIO", None)], nota="Anexo 11 vale para todas as formas exceto as orgânicas; compostos orgânicos de mercúrio: Anexo 13."),
    "acido-fosforico": dict(a13=[(OPD, "fosfórico")]),
    "acido-sulfurico": dict(a13=[(OPD, "sulfúrico")]),
    "amianto": dict(a12="asbesto", a13=[("SILICATOS", None)], nota="Anexo 13 (silicatos): aplicável às atividades listadas, conforme o processo."),
    "dioxido-de-titanio": dict(), "tgic": dict(),
}

# ------------------------------------------------------------------ agentes novos
# npg: página NIOSH (tools/dados/niosh-npg-novos-…json); a11: nome exato no Quadro n.º 1; a12: chave em ANEXO12;
# a13: seletores do Anexo 13; d53/d83/div: códigos (":fam" por família, ":classe" pela classe química, outro texto = observação);
# linach: nome no Grupo 1 (tools/dados/linach-grupo1.json); obs: observações.
N = [
 dict(id="arsenio", nome="Arsênio e compostos inorgânicos", sinonimos=["Arsênico", "Arsenic", "As", "Trióxido de arsênio"], cas="7440-38-2", tipo="substância", grupos=[MET, DEF],
      npg="0038", a13=[("ARSÊNICO", None)], d53=["1.2.1"], d83=["1.2.1"], div=["1.0.1"], linach="Arsênio e compostos inorgânicos de arsênio"),
 dict(id="berilio", nome="Berílio e compostos", sinonimos=["Glicínio", "Beryllium", "Be"], cas="7440-41-7", tipo="substância", grupos=[MET],
      npg="0054", a13=[(OPD, "berílio")], d53=["1.2.2"], d83=["1.2.2"], div=["1.0.4"], linach="Berílio e seus compostos"),
 dict(id="bromo", nome="Bromo", sinonimos=["Bromine", "Br2"], cas="7726-95-6", tipo="substância", grupos=[HAL],
      npg="0064", a11="Bromo", d53=["1.2.9:classe"], d83=["1.2.11"], div=["1.0.5"]),
 dict(id="acido-bromidrico", nome="Ácido bromídrico (brometo de hidrogênio)", sinonimos=["Brometo de hidrogênio", "Hydrogen bromide", "HBr"], cas="10035-10-6", tipo="substância", grupos=[ACI, HAL],
      npg="0331", a13=[(OPD, "bromídrico")], d53=["1.2.9:classe"], d83=["1.2.11"], div=["1.0.5:fam"]),
 dict(id="brometo-de-metila", nome="Brometo de metila", sinonimos=["Bromometano", "Bromureto de metila", "Methyl bromide"], cas="74-83-9", tipo="substância", grupos=[HAL, DEF],
      npg="0400", a11="Brometo de metila", d53=["1.2.11"], d83=["1.2.10"], div=["1.0.5:fam"]),
 dict(id="bromoformio", nome="Bromofórmio", sinonimos=["Tribromometano", "Bromoform"], cas="75-25-2", tipo="substância", grupos=[HAL],
      npg="0066", a11="Bromofórmio", d53=["1.2.11:classe"], d83=["1.2.10"], div=["1.0.5:fam"]),
 dict(id="cloro", nome="Cloro", sinonimos=["Cloro gasoso", "Chlorine", "Cl2"], cas="7782-50-5", tipo="substância", grupos=[HAL, GAS],
      npg="0115", a11="Cloro", d53=["1.2.9:classe"], d83=["1.2.11"], div=["1.0.9"]),
 dict(id="acido-cloridrico", nome="Ácido clorídrico (cloreto de hidrogênio)", sinonimos=["Ácido muriático", "Cloreto de hidrogênio", "Hydrogen chloride", "HCl"], cas="7647-01-0", tipo="substância", grupos=[ACI, HAL],
      npg="0332", a11="Ácido clorídrico", d53=["1.2.9:classe"], d83=["1.2.11"], div=["1.0.9:fam"]),
 dict(id="fluor", nome="Flúor", sinonimos=["Fluorine", "F2"], cas="7782-41-4", tipo="substância", grupos=[HAL, GAS],
      npg="0289", d53=["1.2.9:classe"], d83=["1.2.11"], div=[]),
 dict(id="acido-fluoridrico", nome="Ácido fluorídrico (fluoreto de hidrogênio)", sinonimos=["Fluoreto de hidrogênio", "Hydrogen fluoride", "HF"], cas="7664-39-3", tipo="substância", grupos=[ACI, HAL],
      npg="0334", a11="Ácido fluorídrico", d53=["1.2.9:classe"], d83=["1.2.11"], div=[]),
 dict(id="cloreto-de-vinila", nome="Cloreto de vinila (MVC)", sinonimos=["Monocloreto de vinila", "Cloroeteno", "Vinyl chloride"], cas="75-01-4", tipo="substância", grupos=[HAL, BOR],
      npg="0658", a11="Cloreto de vinila", d53=["1.2.11:classe"], d83=["1.2.10:fam"], div=["1.0.9"], linach="Cloreto de vinila"),
 dict(id="cloroformio", nome="Clorofórmio", sinonimos=["Triclorometano", "Chloroform"], cas="67-66-3", tipo="substância", grupos=[HAL],
      npg="0127", a11="Clorofórmio", d53=["1.2.11"], d83=["1.2.10"], div=["1.0.9"]),
 dict(id="tetracloreto-de-carbono", nome="Tetracloreto de carbono", sinonimos=["Tetraclorometano", "Carbon tetrachloride"], cas="56-23-5", tipo="substância", grupos=[HAL],
      npg="0107", a11="Tetracloreto de carbono", d53=["1.2.11"], d83=["1.2.10"], div=["1.0.9"]),
 dict(id="cloreto-de-metila", nome="Cloreto de metila", sinonimos=["Clorometano", "Methyl chloride"], cas="74-87-3", tipo="substância", grupos=[HAL],
      npg="0403", a11="Cloreto de metila", d53=["1.2.11"], d83=["1.2.10"], div=["1.0.9:fam"]),
 dict(id="1-2-dicloroetano", nome="1,2-Dicloroetano", sinonimos=["Dicloreto de etileno", "Dicloretano", "Ethylene dichloride"], cas="107-06-2", tipo="substância", grupos=[HAL],
      npg="0271", a11="1,2 Dicloroetano", d53=["1.2.11:classe"], d83=["1.2.10"], div=["1.0.9:fam"]),
 dict(id="tetracloroetano", nome="1,1,2,2-Tetracloroetano", sinonimos=["Tetracloretano", "1,1,2,2-Tetrachloroethane"], cas="79-34-5", tipo="substância", grupos=[HAL],
      npg="0598", a11="Tetracloroetano", d53=["1.2.11:classe"], d83=["1.2.10"], div=["1.0.9:fam"]),
 dict(id="pcb", nome="Bifenilas policloradas (PCB)", sinonimos=["Ascarel", "Clorodifenil", "Bifenis policlorados", "PCBs"], cas="1336-36-3", tipo="mistura", grupos=[HAL],
      npg="0125", npgNota="Página usada: 'Chlorodiphenyl (42% chlorine)' (CAS 53469-21-9); o NIOSH informa que o REL vale também para as demais PCBs. Há página própria para 54% de cloro (npgd0126).",
      d53=["1.2.11:classe"], d83=["1.2.10:fam"], div=["1.0.9"], linach="Bifenis policlorados"),
 dict(id="cloropreno", nome="Cloropreno", sinonimos=["beta-Cloropreno", "2-Cloro-1,3-butadieno", "Chloroprene"], cas="126-99-8", tipo="substância", grupos=[HAL, BOR],
      npg="0133", a11="Cloroprene", d53=["1.2.11:classe"], d83=["1.2.10:fam"], div=["1.0.9:fam", "1.0.19:Grupo I"]),
 dict(id="epicloridrina", nome="Epicloridrina", sinonimos=["1-Cloro-2,3-epoxipropano", "Epichlorohydrin"], cas="106-89-8", tipo="substância", grupos=[HAL, CAN],
      npg="0254", a13=[(OPD, "epicloridrina")], d53=["1.2.11:classe"], d83=[], div=["1.0.19:Grupo II – grafado no decreto como '1-cloro-2… 3-poxipropano'"]),
 dict(id="ddt", nome="DDT", sinonimos=["Diclorodifeniltricloroetano", "Dicophane"], cas="50-29-3", tipo="substância", grupos=[DEF, HAL],
      npg="0174", a13=[(HC, "organoclorados")], d53=["1.2.11:classe"], d83=["1.2.10"], div=["1.0.9"]),
 dict(id="lindano", nome="Lindano (gama-BHC)", sinonimos=["gama-Hexaclorociclohexano", "BHC", "Hexacloreto de benzeno", "Lindane"], cas="58-89-9", tipo="substância", grupos=[DEF, HAL],
      npg="0370", a13=[(HC, "organoclorados")], d53=["1.2.11:classe"], d83=["1.2.10"], div=["1.0.9"]),
 dict(id="dissulfeto-de-carbono", nome="Dissulfeto de carbono", sinonimos=["Sulfeto de carbono", "Sulfureto de carbono", "Carbon disulfide", "CS2"], cas="75-15-0", tipo="substância", grupos=[GAS, BOR],
      npg="0104", a11="Dissulfeto de carbono", d53=["1.2.11"], d83=["1.2.10"], div=["1.0.11"]),
 dict(id="fosforo-branco", nome="Fósforo branco (amarelo)", sinonimos=["Fósforo amarelo", "Phosphorus (yellow)", "P4"], cas="7723-14-0", tipo="substância", grupos=[MET],
      npg="0507", a13=[(FOSF, "fósforo branco")], d53=["1.2.6"], d83=["1.2.6"], div=["1.0.12"]),
 dict(id="iodo", nome="Iodo", sinonimos=["Iodine", "I2"], cas="7553-56-2", tipo="substância", grupos=[HAL],
      npg="0342", d53=["1.2.9:classe"], d83=["1.2.11:fam"], div=["1.0.13"]),
 dict(id="niquel-carbonila", nome="Níquel carbonila", sinonimos=["Níquel tetracarbonila", "Nickel carbonyl"], cas="13463-39-3", tipo="substância", grupos=[MET],
      npg="0444", a11="Níquel carbonila (níquel tetracarbonila)", d53=["1.2.9:classe"], d83=["1.2.11:fam"], div=["1.0.16"]),
 dict(id="talio", nome="Tálio (compostos solúveis)", sinonimos=["Thallium", "Tl"], cas="", tipo="grupo/fumos", grupos=[MET],
      npg="0608", a13=[(OPD, "tálio")], d53=["1.2.9:classe"], d83=[], div=[]),
 dict(id="aluminio-po", nome="Alumínio (pós e tintas de alumínio)", sinonimos=["Pó de alumínio", "Aluminum", "Al"], cas="7429-90-5", tipo="substância", grupos=[MET, TINTAS],
      npg="0022", a13=[(OPD, "alumínio")], d53=["1.2.9:classe"], d83=[], div=[]),
 dict(id="ouro", nome="Ouro (redução, separação e fundição)", sinonimos=["Gold", "Au"], cas="", tipo="substância", grupos=[MET],
      d53=["1.2.9:classe"], d83=["1.2.9"], div=[], obs="Dec. 83.080/1979, 1.2.9: só redução, separação e fundição do ouro. Não consta do Anexo IV (2.172/97 e 3.048/99). Sem página no NIOSH Pocket Guide."),
 dict(id="manganes-poeira", nome="Manganês e compostos (poeiras de minério)", sinonimos=["Pirolusita", "Dióxido de manganês", "Manganese"], cas="7439-96-5", tipo="grupo/fumos", grupos=[MET, POE],
      npg="0379", a12="manganes-poeira", a13=[(OPD, "manganês")], d53=["1.2.7"], d83=["1.2.7"], div=["1.0.14"],
      npgNota="Página 'Manganese compounds and fume (as Mn)' – a mesma usada para os fumos de manganês."),
 dict(id="silica-livre", nome="Sílica livre cristalizada (quartzo)", sinonimos=["Quartzo", "Sílica cristalina", "Cristobalita", "SiO2"], cas="14808-60-7", tipo="substância", grupos=[POE],
      npg="0684", a12="silica", d53=["1.2.10"], d83=["1.2.12"], div=["1.0.18"], linach="Poeira de sílica, cristalina, em forma de quartzo ou cristobalita"),
 dict(id="talco", nome="Talco", sinonimos=["Talc", "Silicato de magnésio hidratado"], cas="14807-96-6", tipo="substância", grupos=[POE],
      npg="0584", a13=[("SILICATOS", "talco")], d53=["1.2.10"], d83=["1.2.12"], div=[],
      obs="Anexo IV: só se houver sílica livre (1.0.18) ou amianto (1.0.2) no talco – conferir laudo de composição. LINACH: talco com fibras de amianto é Grupo 1 (nota do item asbestos)."),
 dict(id="cimento", nome="Cimento Portland", sinonimos=["Cimento", "Portland cement"], cas="65997-15-1", tipo="mistura", grupos=[POE],
      npg="0521", a13=[(OPD, "cimento")], d53=["1.2.10"], d83=["1.2.12"], div=[],
      obs="Anexo IV: só pela sílica livre (1.0.18), se houver, com avaliação quantitativa – conferir. Álcalis do cimento úmido: ver Anexo 13 (álcalis cáusticos), conforme a atividade."),
 dict(id="oxido-de-calcio", nome="Óxido de cálcio (cal virgem)", sinonimos=["Cal virgem", "Cal viva", "Calcium oxide", "CaO"], cas="1305-78-8", tipo="substância", grupos=[POE, ACI],
      npg="0093", a13=[(OPD, "cal e cimento")], d53=["1.2.9:classe"], d83=[], div=[]),
 dict(id="carvao-mineral", nome="Carvão mineral (poeira)", sinonimos=["Poeira de carvão", "Hulha", "Coal dust"], cas="", tipo="grupo/fumos", grupos=[POE],
      npg="0144", a13=[("CARVÃO", None)], d53=["1.2.10"], d83=["1.2.12"], div=["1.0.7"]),
 dict(id="alcatrao-piche", nome="Alcatrão e piche de hulha (voláteis)", sinonimos=["Breu de alcatrão de hulha", "Piche", "Coal tar pitch volatiles", "Alcatrão de hulha"], cas="65996-93-2", tipo="mistura", grupos=[COMB],
      npg="0145", a13=[(HC, "alcatrão")], d53=["1.2.11:classe"], d83=["1.2.10:fam"], div=["1.0.7"], linach="Breu de alcatrão de hulha"),
 dict(id="negro-de-fumo", nome="Negro de fumo", sinonimos=["Carbon black", "Fuligem industrial"], cas="1333-86-4", tipo="substância", grupos=[BOR, TINTAS],
      npg="0102", a11="Negro de fumo", a13=[(HC, "negro de fumo")], d53=["1.2.11:classe"], d83=[], div=["1.0.7"]),
 dict(id="parafina", nome="Parafina (fumos)", sinonimos=["Cera de parafina", "Paraffin wax fume"], cas="8002-74-2", tipo="mistura", grupos=[OLEOS, COMB],
      npg="0477", a13=[(HC, "parafina")], d53=["1.2.11:classe"], d83=[], div=["1.0.7"]),
 dict(id="asfalto-fumos", nome="Asfalto / betume (fumos)", sinonimos=["Betume", "Fumos de asfalto", "CAP – cimento asfáltico", "Asphalt fumes"], cas="8052-42-4", tipo="mistura", grupos=[COMB],
      npg="0042", a13=[(HC, "betume")], d53=["1.2.11:classe"], d83=[], div=["1.0.7", "1.0.17"]),
 dict(id="creosoto", nome="Creosoto", sinonimos=["Creosoto de alcatrão de hulha", "Creosote"], cas="", tipo="mistura", grupos=[COMB],
      d53=["1.2.11:classe"], d83=[], div=["1.0.19:Grupo II, alínea g – preservação da madeira"], obs="Sem página no NIOSH Pocket Guide; CAS não conferido nesta inclusão."),
 dict(id="benzo-a-pireno", nome="Benzo[a]pireno", sinonimos=["Benzopireno", "BaP", "Benzo(a)pyrene"], cas="50-32-8", tipo="substância", grupos=[CAN, COMB],
      a13=[(OPD, "benzopireno")], d53=["1.2.11:classe"], d83=[], div=["1.0.19:Grupo II"], linach="Benzo[a]pireno",
      obs="Sem página no NIOSH Pocket Guide (componente dos voláteis de piche de hulha, npgd0145). O Manual de Aposentadoria Especial do INSS (2018) também o relaciona ao código 1.0.3."),
 dict(id="estireno", nome="Estireno", sinonimos=["Vinilbenzeno", "Estirol", "Styrene"], cas="100-42-5", tipo="substância", grupos=[BOR, TINTAS],
      npg="0571", a11="Estireno", d53=["1.2.11:classe"], d83=["1.2.10:fam"], div=["1.0.19:Grupos I e II"]),
 dict(id="1-3-butadieno", nome="1,3-Butadieno", sinonimos=["Butadieno", "1,3-Butadiene"], cas="106-99-0", tipo="substância", grupos=[BOR, GAS],
      npg="0067", a11="1,3 Butadieno", d53=["1.2.11:classe"], d83=["1.2.10:fam"], div=["1.0.19:Grupos I e II"], linach="1,3 Butadieno"),
 dict(id="acrilonitrila", nome="Acrilonitrila", sinonimos=["Cianeto de vinila", "Acrylonitrile"], cas="107-13-1", tipo="substância", grupos=[BOR],
      npg="0014", a11="Acrilonitrila", d53=["1.2.11:classe"], d83=["1.2.10:fam"], div=["1.0.19:Grupos I e II"]),
 dict(id="metilmercaptana", nome="Metilmercaptana (metanotiol)", sinonimos=["Mercaptana", "Metanotiol", "Methyl mercaptan"], cas="74-93-1", tipo="substância", grupos=[BOR, GAS],
      npg="0425", a11="Metil mercaptana (metanotiol)", d53=["1.2.11:classe"], d83=[], div=["1.0.19:Grupo I – mercaptanos"]),
 dict(id="anilina", nome="Anilina", sinonimos=["Aminobenzeno", "Fenilamina", "Aniline"], cas="62-53-3", tipo="substância", grupos=[CAN, BOR],
      npg="0033", a11="Anilina", a13=[(HC, "homólogos da anilina"), (HC, "aminoderivados, derivados")], d53=["1.2.11:classe"], d83=[], div=["1.0.19:aminas aromáticas"]),
 dict(id="o-toluidina", nome="o-Toluidina", sinonimos=["orto-Toluidina", "Ortotoluidina", "o-Toluidine"], cas="95-53-4", tipo="substância", grupos=[CAN],
      npg="0622", a13=[(HC, "homólogos da anilina")], d53=["1.2.11:classe"], d83=[], div=["1.0.19:Grupo II"], linach="orto-Toluidina"),
 dict(id="4-aminodifenil", nome="4-Aminodifenil (4-aminobifenila)", sinonimos=["p-Xenilamina", "4-Aminobifenila", "Aminobifenila", "4-Aminodiphenyl"], cas="92-67-1", tipo="substância", grupos=[CAN],
      npg="0025", a13=[(CANC, "4-amino difenil")], d53=["1.2.11:classe"], d83=[], div=["1.0.19:Grupo II"], linach="4-Aminobifenila"),
 dict(id="benzidina", nome="Benzidina", sinonimos=["Benzidine", "4,4'-Diaminobifenila"], cas="92-87-5", tipo="substância", grupos=[CAN],
      npg="0051", a13=[(CANC, "benzidina")], d53=["1.2.11:classe"], d83=[], div=["1.0.19:Grupo II"], linach="Benzidina",
      obs="O Manual de Aposentadoria Especial do INSS (2018) também a relaciona ao código 1.0.3."),
 dict(id="beta-naftilamina", nome="Betanaftilamina (2-naftilamina)", sinonimos=["2-Naftilamina", "beta-Naphthylamine"], cas="91-59-8", tipo="substância", grupos=[CAN],
      npg="0442", a13=[(CANC, "betanaftilamina")], d53=["1.2.11:classe"], d83=[], div=["1.0.19:Grupo II"], linach="2-Naftilamina"),
 dict(id="4-nitrodifenil", nome="4-Nitrodifenil", sinonimos=["4-Nitrobifenila", "4-Nitrobiphenyl"], cas="92-93-3", tipo="substância", grupos=[CAN],
      npg="0451", a13=[(CANC, "4-nitrodifenil")], d53=["1.2.11:classe"], d83=[], div=["1.0.19:Grupo II"]),
 dict(id="bcme", nome="Éter bis(clorometílico) (BCME)", sinonimos=["Bis(clorometil) éter", "bis-Chloromethyl ether"], cas="542-88-1", tipo="substância", grupos=[CAN, HAL],
      npg="0128", a13=[(OPD, "éter bis")], d53=["1.2.11:classe"], d83=[], div=["1.0.19:Grupo II"], linach="Éter bis (clorometílico); éter metílico de clorometila"),
 dict(id="cmme", nome="Éter metílico de clorometila (CMME)", sinonimos=["Clorometil metil éter", "Chloromethyl methyl ether"], cas="107-30-2", tipo="substância", grupos=[CAN, HAL],
      npg="0129", d53=["1.2.11:classe"], d83=[], div=["1.0.19:Grupo II"], linach="Éter bis (clorometílico); éter metílico de clorometila"),
 dict(id="oxido-de-etileno", nome="Óxido de etileno", sinonimos=["Epoxietano", "Oxirano", "Ethylene oxide"], cas="75-21-8", tipo="substância", grupos=[GAS, CAN, ODONTO],
      npg="0275", a11="Óxido de etileno", d53=["1.2.11:classe"], d83=[], div=["1.0.19:Grupo II – inclui esterilização de materiais cirúrgicos"], linach="Óxido de Etileno"),
 dict(id="moca", nome="MOCA (4,4'-metileno-bis(2-cloroanilina))", sinonimos=["Metileno-ortocloroanilina", "MBOCA", "4,4'-Methylenebis(2-chloroaniline)"], cas="101-14-4", tipo="substância", grupos=[PU, CAN],
      npg="0411", a13=[(OPD, "metileno bis")], d53=["1.2.11:classe"], d83=[], div=["1.0.19:Grupo II"], linach="4,4’-Metileno bis (2-cloroanilina) (MOCA)"),
 dict(id="mda", nome="MDA (4,4'-metilenodianilina)", sinonimos=["4,4'-Diaminodifenilmetano", "4,4'-Methylenedianiline"], cas="101-77-9", tipo="substância", grupos=[PU, CAN],
      npg="0415", a13=[(OPD, "metileno dianilina")], d53=["1.2.11:classe"], d83=[], div=["1.0.19:fam"]),
 dict(id="sulfato-de-dimetila", nome="Sulfato de dimetila (dimetilsulfato)", sinonimos=["Dimetilsulfato", "Dimethyl sulfate"], cas="77-78-1", tipo="substância", grupos=[CAN],
      npg="0229", a11="Sulfato de dimetila", d53=["1.2.11:classe"], d83=[], div=["1.0.19:Grupo II"]),
 dict(id="sulfato-de-dietila", nome="Sulfato de dietila (dietilsulfato)", sinonimos=["Dietilsulfato", "Diethyl sulfate"], cas="", tipo="substância", grupos=[CAN],
      d53=["1.2.11:classe"], d83=[], div=["1.0.19:Grupo II"], obs="Sem página no NIOSH Pocket Guide; CAS não conferido nesta inclusão."),
 dict(id="iodeto-de-metila", nome="Iodeto de metila", sinonimos=["Iodometano", "Methyl iodide"], cas="74-88-4", tipo="substância", grupos=[HAL, CAN],
      npg="0420", d53=["1.2.11:classe"], d83=[], div=["1.0.19:Grupo II"]),
 dict(id="betapropiolactona", nome="Betapropiolactona", sinonimos=["beta-Propiolactona", "beta-Propiolactone"], cas="57-57-8", tipo="substância", grupos=[CAN],
      npg="0528", a13=[(OPD, "betapropiolactona")], d53=["1.2.11:classe"], d83=[], div=["1.0.19:Grupo II"]),
 dict(id="nitrosaminas", nome="Nitrosaminas (N-nitrosodimetilamina)", sinonimos=["N-Nitrosodimetilamina", "NDMA", "Nitrosamina"], cas="62-75-9", tipo="grupo/fumos", grupos=[CAN, BOR],
      npg="0461", a13=[(OPD, "nitrosaminas")], d53=["1.2.11:classe"], d83=[], div=["1.0.19:Grupo II"]),
 dict(id="etilenoimina", nome="Etilenoimina", sinonimos=["Aziridina", "Etilenoamina", "Ethyleneimine"], cas="151-56-4", tipo="substância", grupos=[CAN],
      npg="0274", a11="Etilenoimina", d53=["1.2.11:classe"], d83=[], div=["1.0.19:Grupo II – grafada 'etilenoamina'"]),
 dict(id="etilenotioureia", nome="Etilenotioureia (ETU)", sinonimos=["ETU", "Ethylene thiourea"], cas="96-45-7", tipo="substância", grupos=[BOR, CAN],
      npg="0276", d53=["1.2.11:classe"], d83=[], div=["1.0.19:Grupo II"]),
 dict(id="diclorobenzidina", nome="3,3'-Diclorobenzidina", sinonimos=["Diclorobenzidina", "3,3'-Dichlorobenzidine"], cas="91-94-1", tipo="substância", grupos=[CAN],
      npg="0191", a13=[(OPD, "dicloro-benzidina")], d53=["1.2.11:classe"], d83=[], div=["1.0.19:Grupo II"]),
 dict(id="o-dianisidina", nome="o-Dianisidina", sinonimos=["Dianisidina", "Dianizidina", "o-Dianisidine"], cas="119-90-4", tipo="substância", grupos=[CAN],
      npg="0180", d53=["1.2.11:classe"], d83=[], div=["1.0.19:Grupo II"]),
 dict(id="dimetilaminoazobenzeno", nome="4-Dimetilaminoazobenzeno", sinonimos=["Amarelo manteiga", "4-Dimethylaminoazobenzene"], cas="60-11-7", tipo="substância", grupos=[CAN],
      npg="0220", d53=["1.2.11:classe"], d83=[], div=["1.0.19:Grupo II"]),
 dict(id="auramina", nome="Auramina (produção)", sinonimos=["Auramine"], cas="", tipo="substância", grupos=[CAN],
      d53=["1.2.11:classe"], d83=[], div=["1.0.19:Grupo II"], linach="Auramina, produção de", obs="Sem página no NIOSH Pocket Guide; CAS não conferido nesta inclusão. LINACH Grupo 1: o processo de produção."),
 dict(id="propanossultona", nome="1,3-Propanossultona", sinonimos=["Propano sultona", "Propanosultona"], cas="", tipo="substância", grupos=[CAN],
      a13=[(OPD, "propano sultone")], d53=["1.2.11:classe"], d83=[], div=["1.0.19:Grupo II"], obs="Sem página no NIOSH Pocket Guide; CAS não conferido nesta inclusão."),
 dict(id="hmpa", nome="Hexametilfosforamida (HMPA)", sinonimos=["HMPA", "Hexamethyl phosphoramide"], cas="680-31-9", tipo="substância", grupos=[CAN],
      npg="0321", a13=[(OPD, "hexametilfosforamida")], d53=["1.2.11:classe"], d83=[], div=[]),
 dict(id="cloreto-de-dimetilcarbamila", nome="Cloreto de dimetilcarbamila", sinonimos=["Cloreto de dimetilcarbamoíla", "DMCC", "Dimethyl carbamoyl chloride"], cas="79-44-7", tipo="substância", grupos=[CAN],
      npg="0224", a13=[(OPD, "dimetil-carbamila")], d53=["1.2.11:classe"], d83=[], div=[]),
 dict(id="dioxido-de-vinilciclohexeno", nome="Dióxido de vinilciclohexeno", sinonimos=["Dióxido de vinil ciclohexano", "Vinyl cyclohexene dioxide"], cas="106-87-6", tipo="substância", grupos=[CAN],
      npg="0659", a13=[(OPD, "dióxido de vinil")], d53=["1.2.11:classe"], d83=[], div=[]),
 dict(id="gas-sulfidrico", nome="Gás sulfídrico (sulfeto de hidrogênio)", sinonimos=["Sulfeto de hidrogênio", "H2S", "Hydrogen sulfide"], cas="7783-06-4", tipo="substância", grupos=[GAS],
      npg="0337", a11="Gás sulfídrico", d53=["1.2.9:classe"], d83=["1.2.11:trabalhos em galerias e tanques de esgoto"], div=[],
      obs="Anexo IV: sem código químico; em galerias, fossas e tanques de esgoto, ver o código 3.0.1 (biológicos)."),
 dict(id="metano", nome="Metano", sinonimos=["Gás metano", "Gás natural (metano)", "Methane"], cas="", tipo="substância", grupos=[GAS, COMB],
      a11="Metano", d53=["1.2.11"], d83=["1.2.11:trabalhos em galerias e tanques de esgoto"], div=["1.0.17:fam"],
      obs="Sem página no NIOSH Pocket Guide; CAS não conferido nesta inclusão."),
 dict(id="nitrobenzeno", nome="Nitrobenzeno", sinonimos=["Nitrobenzol", "Essência de mirbana", "Nitrobenzene"], cas="98-95-3", tipo="substância", grupos=[TINTAS],
      npg="0450", a13=[(HC, "nitroderivados")], d53=["1.2.11"], d83=["1.2.10:fam"], div=[]),
 dict(id="n-pentano", nome="n-Pentano", sinonimos=["Pentano", "n-Pentane"], cas="109-66-0", tipo="substância", grupos=[COMB, TINTAS],
      npg="0486", a11="n-Pentano", d53=["1.2.11"], d83=[], div=["1.0.17:fam"]),
 dict(id="naftaleno", nome="Naftaleno", sinonimos=["Naftalina", "Naphthalene"], cas="91-20-3", tipo="substância", grupos=[COMB, MEC],
      npg="0439", a13=[(HC, "naftaleno")], d53=["1.2.11:classe"], d83=["1.2.10:fam"], div=["1.0.7:fam", "1.0.17:fam"]),
 dict(id="fenol", nome="Fenol", sinonimos=["Ácido fênico", "Hidroxibenzeno", "Phenol"], cas="108-95-2", tipo="substância", grupos=[TINTAS, PU],
      npg="0493", a11="Fenol", a13=[(HC, "fenóis")], d53=["1.2.11:classe"], d83=[], div=[]),
 dict(id="hidroxido-de-sodio", nome="Hidróxido de sódio (soda cáustica)", sinonimos=["Soda cáustica", "Sodium hydroxide", "NaOH"], cas="1310-73-2", tipo="substância", grupos=[ACI],
      npg="0565", a13=[(OPD, "álcalis cáusticos")], d53=["1.2.9:classe"], d83=[], div=[],
      obs="Álcalis cáusticos: pH ≥ 11,5 classifica como corrosivo à pele, Categoria 1, salvo reserva alcalina que indique o contrário (NBR 14725:2023, item 5.3.2.2.2.5)."),
 dict(id="acido-nitrico", nome="Ácido nítrico", sinonimos=["Nitric acid", "HNO3"], cas="7697-37-2", tipo="substância", grupos=[ACI],
      npg="0447", a13=[(OPD, "nítrico")], d53=["1.2.9:classe"], d83=[], div=[]),
 dict(id="acido-oxalico", nome="Ácido oxálico", sinonimos=["Oxalic acid"], cas="144-62-7", tipo="substância", grupos=[ACI],
      npg="0474", a13=[(OPD, "oxálico")], d53=["1.2.11:classe"], d83=[], div=[]),
 dict(id="acido-picrico", nome="Ácido pícrico", sinonimos=["Trinitrofenol", "Picric acid"], cas="88-89-1", tipo="substância", grupos=[ACI],
      npg="0515", a13=[(OPD, "pícrico")], d53=["1.2.11:classe"], d83=[], div=[]),
]
# Medicamentos do Grupo II do código 1.0.19 (CAS da LINACH, Grupo 1, quando constam)
for i, nome, sin, linach in [
    ("azatioprina", "Azatioprina", ["Azathioprine"], "Azatioprina"),
    ("ciclofosfamida", "Ciclofosfamida", ["Cyclophosphamide"], "Ciclofosfamida"),
    ("clorambucil", "Clorambucil", ["Cloroambucil", "Chlorambucil"], "Clorambucil"),
    ("dietilestilbestrol", "Dietilestilbestrol", ["DES", "Diethylstilbestrol"], "Dietilestilbestrol"),
    ("bussulfano", "Bussulfano (Mileran)", ["1,4-Butanodiol dimetanossulfonato", "Mileran", "Busulfan"], "Bussulfano"),
    ("fenacetina", "Fenacetina", ["Phenacetin"], "Fenacetina"),
    ("oximetolona", "Oximetolona", ["Oximetalona", "Oxymetholone"], None),
    ("procarbazina", "Procarbazina", ["Procarbazine"], None),
]:
    N.append(dict(id=i, nome=nome, sinonimos=sin, cas="", tipo="substância", grupos=[MED], d53=[], d83=[], div=["1.0.19:Grupo II – alínea f, produção de medicamentos"],
                  linach=linach, casDaLinach=bool(linach), obs="Anexo IV, 1.0.19, Grupo II (alínea f: produção de medicamentos). Sem página no NIOSH Pocket Guide."))

# IARC Monographs – List of Classifications (webapi.iarc.who.int/loc/loc.app.js), consultada em 2026-11-11 pelo CAS.
# id → (grupo, entrada). Ausente = sem entrada na lista para o CAS do agente.
IARC = {
 "arsenio": ("1", "Arsenic and inorganic arsenic compounds"), "berilio": ("1", "Beryllium and beryllium compounds"),
 "brometo-de-metila": ("3", "Methyl bromide"), "bromoformio": ("3", "Bromoform"), "acido-cloridrico": ("3", "Hydrochloric acid"),
 "cloreto-de-vinila": ("1", "Vinyl chloride"), "cloroformio": ("2B", "Chloroform"), "tetracloreto-de-carbono": ("2B", "Carbon tetrachloride"),
 "cloreto-de-metila": ("3", "Methyl chloride"), "1-2-dicloroetano": ("2B", "1,2-Dichloroethane"), "tetracloroetano": ("2B", "1,1,2,2-Tetrachloroethane"),
 "pcb": ("1", "Polychlorinated biphenyls"), "cloropreno": ("2B", "Chloroprene"), "epicloridrina": ("2A", "Epichlorohydrin"),
 "ddt": ("2A", "DDT (4,4'-dichlorodiphenyltrichloroethane)"), "lindano": ("1", "Lindane"),
 "silica-livre": ("1", "Silica dust, crystalline, in the form of quartz or cristobalite"), "talco": ("2A", "Talc"),
 "alcatrao-piche": ("1", "Coal-tar pitch"), "negro-de-fumo": ("2B", "Carbon black"),
 "asfalto-fumos": ("2B", "Bitumens, occupational exposure to straight-run bitumens and their emissions during road paving"),
 "creosoto": ("2A", "Creosotes"), "benzo-a-pireno": ("1", "Benzo[a]pyrene"), "estireno": ("2A", "Styrene"),
 "1-3-butadieno": ("1", "1,3-Butadiene"), "acrilonitrila": ("1", "Acrylonitrile"), "anilina": ("2A", "Aniline"),
 "o-toluidina": ("1", "ortho-Toluidine"), "4-aminodifenil": ("1", "4-Aminobiphenyl"), "benzidina": ("1", "Benzidine"),
 "beta-naftilamina": ("1", "2-Naphthylamine"), "4-nitrodifenil": ("3", "4-Nitrobiphenyl"),
 "bcme": ("1", "Bis(chloromethyl)ether; chloromethyl methyl ether (technical-grade)"), "cmme": ("1", "Bis(chloromethyl)ether; chloromethyl methyl ether (technical-grade)"),
 "oxido-de-etileno": ("1", "Ethylene oxide"), "moca": ("1", "4,4'-Methylenebis(2-chloroaniline) (MOCA)"), "mda": ("2B", "4,4'-Methylenedianiline"),
 "sulfato-de-dimetila": ("2A", "Dimethyl sulfate"), "sulfato-de-dietila": ("2A", "Diethyl sulfate"), "iodeto-de-metila": ("3", "Methyl iodide"),
 "betapropiolactona": ("2B", "beta-Propiolactone"), "nitrosaminas": ("2A", "N-Nitrosodimethylamine"), "etilenoimina": ("2B", "Aziridine"),
 "etilenotioureia": ("3", "Ethylenethiourea"), "diclorobenzidina": ("2B", "3,3'-Dichlorobenzidine"),
 "o-dianisidina": ("2B", "3,3'-Dimethoxybenzidine (ortho-Dianisidine)"), "dimetilaminoazobenzeno": ("2B", "para-Dimethylaminoazobenzene"),
 "auramina": ("2B", "Auramine"), "propanossultona": ("2A", "1,3-Propane sultone"), "hmpa": ("2B", "Hexamethylphosphoramide"),
 "cloreto-de-dimetilcarbamila": ("2A", "Dimethylcarbamoyl chloride"), "dioxido-de-vinilciclohexeno": ("2B", "4-Vinylcyclohexene diepoxide"),
 "nitrobenzeno": ("2B", "Nitrobenzene"), "naftaleno": ("2B", "Naphthalene"), "fenol": ("3", "Phenol"),
 "azatioprina": ("1", "Azathioprine"), "ciclofosfamida": ("1", "Cyclophosphamide"), "clorambucil": ("1", "Chlorambucil"),
 "dietilestilbestrol": ("1", "Diethylstilbestrol"), "bussulfano": ("1", "Busulfan"), "fenacetina": ("1", "Phenacetin"),
}
IARC_NOTA = {
 "procarbazina": "A lista IARC traz 'Procarbazine hydrochloride' (CAS 366-70-1) no Grupo 2A; não atribuído ao agente base.",
 "fosforo-branco": "Sem entrada para fósforo branco; a lista traz só 'Phosphorus-32, as phosphate' (Grupo 1).",
}
# CAS sem página NIOSH, confirmados na lista IARC (entrada com o mesmo agente)
CAS_IARC = {"creosoto": "8001-58-9", "sulfato-de-dietila": "64-67-5", "auramina": "492-80-8", "propanossultona": "1120-71-4"}


def f2c(s):
    def conv(m):
        a, b = m.group(1), m.group(2)
        c = lambda v: str(round((float(v) - 32) * 5 / 9))
        return f"{m.group(0)} ({c(a)}–{c(b)} °C)" if b else f"{m.group(0)} ({c(a)} °C)"
    return re.sub(r"(-?\d+(?:\.\d+)?)(?:\s*(?:-|to)\s*(-?\d+(?:\.\d+)?))?\s*°F", conv, s or "")


def linach_g1(nome):
    if not nome:
        return None
    m = [x for x in LINACH1 if sem_acento(x["nome"]).startswith(sem_acento(nome))]
    if not m:
        raise SystemExit(f"LINACH Grupo 1: '{nome}' não encontrado")
    return m[0]


def novo(a):
    fontes = []
    ni = NIOSH.get(a.get("npg") or "")
    cas = a["cas"]
    lg = linach_g1(a.get("linach"))
    if a.get("casDaLinach") and lg and lg["cas"]:
        cas = lg["cas"][0]
    if not cas and a["id"] in CAS_IARC:
        cas = CAS_IARC[a["id"]]
        fontes.append({"campos": "confirmação do CAS", "referencia": "IARC Monographs – List of Classifications (CAS da entrada do agente)",
                       "url": "https://monographs.iarc.who.int/list-of-classifications/", "consultadoEm": DATA})
    if ni and cas and cas not in ni["cas"] and not a.get("npgNota"):
        raise SystemExit(f"{a['id']}: CAS {cas} difere da página NIOSH ({ni['cas']})")
    ag = dict(id=a["id"], nome=a["nome"], sinonimos=a["sinonimos"], cas=cas, grupos=a["grupos"], tipo=a["tipo"], formula="", massaMolar="")
    fis = dict.fromkeys(["estado", "pontoEbulicao", "pontoFusao", "pressaoVapor", "densidadeRelativa", "densidadeVapor", "solubilidadeAgua",
                         "pontoFulgor", "lie", "lse", "autoignicao", "limiarOdor"], "")
    nio = dict.fromkeys(["rel", "idlh", "oshaPel", "vias", "orgaosAlvo", "sintomas", "metodos", "url"], "")
    if ni:
        url = f"{NPG}npgd{a['npg']}.html"
        if a["tipo"] != "grupo/fumos" or ni.get("formula"):
            ag["formula"] = ni.get("formula", "")
        if ni.get("mw") and re.match(r"^[\d.]", ni["mw"]):
            ag["massaMolar"] = ni["mw"] + " g/mol (NIOSH)"
        fis.update(estado=ni["physicalDescription"], pontoEbulicao=f2c(ni["boilingPoint"]), pontoFusao=f2c(ni["freezingOrMeltingPoint"]),
                   pressaoVapor=ni["vaporPressure"], densidadeRelativa=ni["specificGravity"], densidadeVapor=ni["relativeGasDensity"],
                   solubilidadeAgua=ni["solubility"], pontoFulgor=f2c(ni["flashPoint"]), lie=ni["lel"], lse=ni["uel"])
        nio.update(rel=ni["nioshRel"], idlh=ni["idlh"], oshaPel=ni["oshaPel"], vias=ni["exposureRoutes"], orgaosAlvo=ni["targetOrgans"],
                   sintomas=ni["symptoms"], metodos=ni["measurementMethods"], url=url)
        f = {"campos": "identificação (CAS), fórmula, massa molar, propriedades físico-químicas e bloco niosh",
             "referencia": f"NIOSH Pocket Guide to Chemical Hazards – {ni['title']} (CAS na página: {ni['cas'] or '—'})", "url": url, "consultadoEm": DATA}
        if a.get("npgNota"):
            f["nota"] = a["npgNota"]
        fontes.append(f)
    ag["fisico"], ag["niosh"] = fis, nio
    # LINACH (só o Grupo 1 foi conferido nesta inclusão)
    ag["linach"] = "Grupo 1" if lg else ""
    fontes.append({"campos": "linach", "referencia": "BRASIL. Portaria Interministerial MTE/MS/MPS nº 9, de 7 de outubro de 2014 (LINACH), Grupo 1 – tools/dados/linach-grupo1.json",
                   "url": "", "consultadoEm": DATA,
                   "nota": (f"Entrada: '{lg['nome'][:120]}'." if lg else "Não consta do Grupo 1.") + " Grupos 2A e 2B não conferidos nesta inclusão."})
    hit = IARC.get(a["id"])
    ag["iarc"] = f"Grupo {hit[0]}" if hit else ""
    nota = (f"Entrada usada: '{hit[1]}'." if hit else "Nenhuma entrada na lista para o CAS do agente.") + (" " + IARC_NOTA[a["id"]] if a["id"] in IARC_NOTA else "")
    fontes.append({"campos": "iarc", "referencia": "IARC Monographs – List of Classifications", "url": "https://monographs.iarc.who.int/list-of-classifications/",
                   "consultadoEm": DATA, "nota": nota})
    ag["codDecretos"] = texto_decretos(a["d53"], a["d83"], a["div"])
    fontes.append({"campos": "códigos nos decretos previdenciários",
                   "referencia": "BRASIL. Decreto nº 53.831/1964, quadro anexo; Decreto nº 83.080/1979, Anexo I; Decretos nº 2.172/1997 e 3.048/1999, Anexo IV – tools/dados/decretos-quimicos.json",
                   "url": "https://www2.camara.leg.br/legin/fed/decret/1999/decreto-3048-6-maio-1999-368532-normaatualizada-pe.html", "consultadoEm": DATA})
    obs = [a["obs"]] if a.get("obs") else []
    obs = [o.replace("; CAS não conferido nesta inclusão.", ".").replace(" CAS não conferido nesta inclusão.", "") if cas else o for o in obs]
    if not cas:
        obs.append("CAS em branco: conferir.")
    ag["observacoes"] = " ".join(obs)
    ag["fontes"], ag["situacao"] = fontes, "A conferir"
    classificar(ag, a)
    return ag


def main():
    with open(BASE, encoding="utf-8") as f:
        base = json.load(f)
    ids_novos = {a["id"] for a in N}
    antigos = [a for a in base["agentes"] if a["id"] not in ids_novos]
    for ag in antigos:
        regra = EXIST.get(ag["id"], {})
        nr = ag.get("nr15") or {}
        obs = nr.get("observacao", "")
        if "anexos" in nr:  # já classificado por esta rotina
            obs = nr.get("quadro1", "")
        # a observação anterior pode já ter sido reescrita por esta rotina: guarda só a parte do Quadro n.º 1
        m = re.match(r"^((?:Linha do Quadro n\.º 1: '.*?'\.)|(?:Quadro n\.º 1:.*?\(.*?\)\.)|(?:Não localizado no Quadro n\.º 1[^.]*\.)|(?:O Quadro n\.º 1 não tem[^)]*\)\.))", obs)
        obs_ant = m.group(1) if m else obs.split(" Anexo 1")[0]
        if obs_ant.startswith("Não consta dos Anexos") or obs_ant.startswith("Não localizado"):
            obs_ant = ""
        classificar(ag, regra, obs_ant)
    novos = [novo(a) for a in N]
    base["agentes"] = antigos + novos
    base["versao"] = VERSAO
    base["descricao"] = ("Base de agentes químicos – fontes abertas; inclui os agentes dos decretos previdenciários (53.831/64, 83.080/79, "
                         "2.172/97 e 3.048/99) e a classificação pelos Anexos 11, 12, 13 e 13-A da NR-15; conferir antes de usar em laudo")
    with open(BASE, "w", encoding="utf-8") as f:
        json.dump(base, f, ensure_ascii=False, indent=1)
    from collections import Counter
    c = Counter(x for a in base["agentes"] for x in (a["nr15"]["anexos"] or ["nenhum"]))
    print(f"{len(antigos)} agentes existentes + {len(novos)} novos = {len(base['agentes'])}; por anexo: {dict(c)}")


if __name__ == "__main__":
    main()

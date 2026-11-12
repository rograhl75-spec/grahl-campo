#!/usr/bin/env python3
"""Completa public/bases/quimicos-base.json: cobertura integral dos agentes químicos da NR-15 (Anexo 11,
Quadro n.º 1; Anexo 12; Anexos 13 e 13-A) e dos decretos previdenciários (53.831/64, 83.080/79, 2.172/97 e
3.048/99) e preenchimento das lacunas (CAS, fórmula, massa molar, NIOSH, IARC, LINACH) de TODOS os agentes.

Roda DEPOIS de gerar_base_quimicos.py e ampliar_base_quimicos.py (reaproveita as funções dos dois).
Parte da base gravada: os agentes existentes mantêm id e valores; só campos vazios são preenchidos.
Os agentes criados aqui (lista NOVOS) são reconstruídos a cada execução (idempotente).

Regras
  - Anexo 11: cada linha do Quadro n.º 1 (tools/dados/nr15-anexo11-quadro1.json) tem um agente; casamento por
    nome/sinônimo normalizado (MAPA_A11 fixa os casos já existentes). Remissões ("vide") e apelidos da
    transcrição viram sinônimos do agente. Asfixiantes simples: anexo11 = null e a observação do item 3.
  - Anexos 12/13/13-A e decretos: agentes citados nas atividades/listas que ainda faltavam (NOVOS, origem
    "Anexo 13" ou "Decretos"); códigos por agente, com os mesmos sufixos de ampliar_base_quimicos.py
    (":classe" = pela classe química do código; ":fam" = por família).
  - CAS / fórmula / massa molar: PubChem PUG REST (por CAS; nos agentes novos, pelo nome em inglês; o CAS é o
    primeiro sinônimo no formato CAS e é conferido com o índice do NIOSH). Misturas e grupos: fórmula "".
  - NIOSH Pocket Guide: página achada pelo CAS no índice npgdcas.html (ou pela página indicada em "npg" quando
    o agente não tem CAS no índice; o título da página é registrado na fonte). Lida do cache local (HTML) ou de
    tools/dados/niosh-npg-2026-11-16.json (campos copiados das páginas – o cdc.gov respondeu 403 ao acesso
    automatizado em 2026-11-11; as páginas foram lidas uma a uma por ferramenta de leitura da web).
  - IARC: lista de webapi.iarc.who.int/loc/loc.app.js (gerar_base_quimicos.iarc_lista), pelo CAS.
  - LINACH: texto oficial da Portaria Interministerial n.º 9/2014 (Grupos 1, 2A e 2B), pelo CAS com zeros à
    esquerda (000071-43-2). Entradas de consumo (bebidas alcoólicas etc.) nunca são atribuídas.
  - Nada é preenchido de memória: o que não está nas fontes fica "" e entra no relatório final.

Cache: QUIMICOS_CACHE (padrão: <scratchpad>/qbase). Na primeira execução o cache é semeado com as cópias
já baixadas (QUIMICOS_SEMENTES, diretórios separados por ":"), se existirem.
Uso:  python3 -I tools/completar_base_quimicos.py [--listar-niosh]
"""
import glob, json, os, re, shutil, sys, time, unicodedata, urllib.error, urllib.parse, urllib.request

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import gerar_base_quimicos as G  # noqa: E402
import ampliar_base_quimicos as AMP  # noqa: E402

DATA = "2026-11-11"
VERSAO = "2026-11-17"
RAIZ = os.path.dirname(AQUI)
BASE = os.path.join(RAIZ, "public", "bases", "quimicos-base.json")
DADOS = os.path.join(AQUI, "dados")
NIOSH_JSON = os.path.join(DADOS, "niosh-npg-2026-11-16.json")
SCR = "/tmp/claude-0/-home-user-grahl-campo/b7c0afe6-08ba-5f4f-af33-253872537fc5/scratchpad"
CACHE = os.environ.get("QUIMICOS_CACHE") or os.path.join(SCR, "qbase")
SEMENTES = os.environ.get("QUIMICOS_SEMENTES", f"{SCR}/cache:{SCR}/dl").split(":")
LINACH_TXT = os.environ.get("LINACH_TXT", os.path.join(SCR, "norm3", "linach_raw.txt"))
NPG = "https://www.cdc.gov/niosh/npg/"
UA = "grahl-campo-completar-base-quimicos/1.0 (Python-urllib)"
G.CACHE = CACHE
sem = AMP.sem_acento


def norm(s):
    return re.sub(r"[^a-z0-9]", "", sem(s))


# ------------------------------------------------------------------ rede (com cache)
CDC_BLOQUEADO = False


def arq_cache(url):
    return os.path.join(CACHE, re.sub(r"[^A-Za-z0-9.]+", "_", url)[-150:])


def semear():
    os.makedirs(CACHE, exist_ok=True)
    for d in SEMENTES:
        for f in glob.glob(os.path.join(d, "*")):
            nome = os.path.basename(f)
            if nome == "npgdcas.html":  # cópia do índice baixada em 2026-11-11
                nome = "https_www.cdc.gov_niosh_npg_npgdcas.html"
            if nome.startswith("https_") and not os.path.exists(os.path.join(CACHE, nome)):
                shutil.copy(f, os.path.join(CACHE, nome))


def get(url, binary=False):
    """GET com cache; 2 s entre requisições ao cdc.gov; em 403 do cdc.gov espera 60 s e tenta uma vez; se
    persistir, desiste do cdc.gov nesta execução (sem trocar o User-Agent)."""
    global CDC_BLOQUEADO
    arq = arq_cache(url)
    if os.path.exists(arq):
        b = open(arq, "rb").read()
        return b if binary else b.decode("utf-8", "replace")
    cdc = "cdc.gov" in url
    if cdc and CDC_BLOQUEADO:
        return None
    for tentativa in range(2):
        time.sleep(2 if cdc else 0.3)
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, context=G.CTX, timeout=60) as r:
                b = r.read()
            open(arq, "wb").write(b)
            return b if binary else b.decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            if e.code == 403 and cdc:
                if tentativa == 0:
                    time.sleep(60)
                    continue
                CDC_BLOQUEADO = True
                print("  cdc.gov respondeu 403 – NIOSH só pelo cache/arquivo de dados", file=sys.stderr)
                return None
            time.sleep(5)
        except Exception as e:  # noqa: BLE001
            print("  falhou:", url, e, file=sys.stderr)
            time.sleep(5)
    return None


G.get = get  # G.niosh e G.iarc_lista passam a usar este get

# ------------------------------------------------------------------ PubChem
PC_URL = "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/"
RE_CAS = re.compile(r"^\d{2,7}-\d\d-\d$")


def cas_valido(c):
    if not RE_CAS.match(c or ""):
        return False
    d = c.replace("-", "")
    return sum(int(x) * (i + 1) for i, x in enumerate(reversed(d[:-1]))) % 10 == int(d[-1])


def pubchem(chave, por_nome=False):
    """chave = CAS ou nome em inglês → {cid, titulo, formula, mw, cas_sin:[CAS nos sinônimos]}"""
    q = urllib.parse.quote(chave, safe="")
    j = get(f"{PC_URL}name/{q}/property/Title,MolecularFormula,MolecularWeight/JSON")
    if not j:
        return None
    ps = json.loads(j).get("PropertyTable", {}).get("Properties", [])
    if not ps:
        return None
    p = ps[0]
    out = dict(cid=p["CID"], titulo=p.get("Title", ""), formula=p.get("MolecularFormula", ""), mw=str(p.get("MolecularWeight", "")), n=len(ps))
    s = get(f"{PC_URL}cid/{p['CID']}/synonyms/JSON")
    sins = json.loads(s)["InformationList"]["Information"][0].get("Synonym", []) if s else []
    out["cas_sin"] = [x for x in sins if cas_valido(x)]
    return out


# ------------------------------------------------------------------ NIOSH
def indice_niosh():
    t = get(NPG + "npgdcas.html")
    if not t:
        return []
    return [(c.strip(), p, G.limpa(n)) for c, p, n in re.findall(r"<tr><td>([^<]*)</td><td><a href='npgd(\d+)\.html'>([^<]*)</a>", t)]


IDX = []
PC_SET, NIO_MW = {}, {}
NIO_DADOS = json.load(open(NIOSH_JSON, encoding="utf-8")) if os.path.exists(NIOSH_JSON) else {}


def npg_por_cas(cas):
    hs = [(p, n) for c, p, n in IDX if re.match(re.escape(cas) + r"(\s|$)", c)]
    return hs


def niosh_pagina(pid):
    """dict no formato de G.niosh, do cache HTML ou do arquivo de dados (campos copiados das páginas)."""
    if pid in NIO_DADOS:
        d = NIO_DADOS[pid]
        fis = {"estado": d.get("physicalDescription", ""), "pontoEbulicao": AMP.f2c(d.get("boilingPoint", "")),
               "pontoFusao": AMP.f2c(d.get("freezingOrMeltingPoint", "")), "pressaoVapor": d.get("vaporPressure", ""),
               "densidadeRelativa": d.get("specificGravity", ""), "densidadeVapor": d.get("relativeGasDensity", ""),
               "solubilidadeAgua": d.get("solubility", ""), "pontoFulgor": AMP.f2c(d.get("flashPoint", "")),
               "lie": d.get("lel", ""), "lse": d.get("uel", "")}
        return dict(url=f"{NPG}npgd{pid}.html", nome=d["title"], cas=d.get("cas", ""), mw=d.get("mw", ""), fis=fis,
                    rel=d.get("nioshRel", ""), pel=d.get("oshaPel", ""), idlh=re.sub(r"\s*See:.*$", "", d.get("idlh", "")),
                    metodos=re.sub(r"\s*See:\s*NMAM or OSHA Methods\s*$", "", d.get("measurementMethods", "")),
                    vias=d.get("exposureRoutes", ""), orgaos=d.get("targetOrgans", ""), sint=d.get("symptoms", ""), arquivo=True)
    try:
        return G.niosh(pid)
    except Exception as e:  # noqa: BLE001
        print(f"  NIOSH {pid}: página não interpretada ({e})", file=sys.stderr)
        return None


# ------------------------------------------------------------------ IARC e LINACH
IARC_URL = "https://monographs.iarc.who.int/list-of-classifications/"
NAO_ATRIBUIR = re.compile(r"alcoholic beverage|bebidas alco|consumo|tobacco|tabaco|plantas que", re.I)


def linach_lista():
    """[(grupo, nome, cas_sem_zeros)] a partir do texto oficial (Grupos 1, 2A e 2B)."""
    if not os.path.exists(LINACH_TXT):
        return None
    out, grupo, nome = [], None, ""
    for ln in open(LINACH_TXT, encoding="utf-8").read().splitlines():
        m = re.match(r"Grupo (1|2A|2B) - Agentes", ln.strip())
        if m:
            grupo = m.group(1)
            continue
        if grupo is None:
            continue
        cs = re.findall(r"\b(\d{6}-\d{2}-\d)\b", ln)
        txt = re.sub(r"\s*\d{6}-\d{2}-\d\s*", " ", ln).strip()
        if txt and txt[:1] not in "(" and not txt[:1].islower() and not re.match(r"^(Agente$|Registro no Chemical|Abstracts Service|Não se aplica)", txt):
            nome = txt
        for c in cs:
            a_, b_, d_ = c.split("-")
            out.append((grupo, nome, f"{int(a_)}-{b_}-{d_}"))
    return out


# ------------------------------------------------------------------ agentes novos
OLEOS, DEF, TINTAS, SOLDA, COMB, ODONTO, PU, MEC = (AMP.OLEOS, AMP.DEF, AMP.TINTAS, AMP.SOLDA, AMP.COMB, AMP.ODONTO, AMP.PU, AMP.MEC)
MET, POE, HAL, GAS, BOR, CAN, ACI = (AMP.MET, AMP.POE, AMP.HAL, AMP.GAS, AMP.BOR, AMP.CAN, AMP.ACI)
OUT = "Outros"
HC, FOSF, OPD = AMP.HC, AMP.FOSF, AMP.OPD
ORGFOSF = AMP.ORGFOSF
C11 = ["1.2.11:classe"]
C9 = ["1.2.9:classe"]
SOLV83 = ["1.2.11:fam"]  # pintura a pistola – associação de solventes (como acetona, MEK e acetatos na base)
HAL83 = ["1.2.10:fam"]
PET = ["1.0.17:fam"]
CLO, BRO = ["1.0.9:fam"], ["1.0.5:fam"]
ASF = "Asfixiante simples (Anexo 11, item 3): exige O₂ mínimo de 18% em volume no ambiente."


def a(id, nome, en, tipo="substância", grupos=(OUT,), a11=None, sin=(), d53=(), d83=(), div=(), **kw):
    return dict(id=id, nome=nome, en=en, tipo=tipo, grupos=list(grupos), a11=a11, sinonimos=list(sin),
                d53=list(d53), d83=list(d83), div=list(div), **kw)


NOVOS = [
 # ---------------- Anexo 11, Quadro n.º 1 (nome do Quadro em a11)
 a("acetaldeido", "Acetaldeído", "Acetaldehyde", grupos=[TINTAS], a11="Acetaldeído", d53=C11),
 a("acetato-de-cellosolve", "Acetato de cellosolve (acetato de 2-etoxietila)", "2-Ethoxyethyl acetate", grupos=[TINTAS], a11="Acetato de cellosolve", d53=["1.2.11"], d83=SOLV83),
 a("acetileno", "Acetileno", "Acetylene", grupos=[GAS, SOLDA], a11="Acetileno", d53=C11),
 a("acetonitrila", "Acetonitrila", "Acetonitrile", grupos=[TINTAS], a11="Acetonitrila", d53=C11),
 a("acido-acetico", "Ácido acético", "Acetic acid", grupos=[ACI], a11="Ácido acético", d53=C11),
 a("acido-cianidrico", "Ácido cianídrico (cianeto de hidrogênio)", "Hydrogen cyanide", grupos=[GAS, ACI], a11="Ácido cianídrico", d53=C9),
 a("acido-cromico-nevoa", "Ácido crômico (névoa)", "Chromium trioxide", grupos=[ACI, MET], a11="Ácido crômico (névoa)", sin=["Trióxido de cromo", "Chromic acid"], npg="0138",
   npgNota="Página 'Chromic acid and chromates' (a mesma do agente 'Cromo VI – compostos'); o índice por CAS do NIOSH não lista o CAS do ácido crômico.",
   a13=[("CROMO", None)], d53=["1.2.5"], d83=["1.2.5"], div=["1.0.10"],
   obs="O Quadro n.º 1 fixa o LT para a névoa de ácido crômico; demais compostos de cromo VI: ver o agente 'Cromo VI – compostos'."),
 a("acido-formico", "Ácido fórmico", "Formic acid", grupos=[ACI], a11="Ácido fórmico", d53=C11),
 a("acrilato-de-metila", "Acrilato de metila", "Methyl acrylate", grupos=[BOR, TINTAS], a11="Acrilato de metila", d53=C11),
 a("alcool-isoamilico", "Álcool isoamílico", "Isoamyl alcohol", grupos=[TINTAS], a11="Álcool isoamílico", d53=["1.2.11"], d83=SOLV83),
 a("alcool-n-butilico", "Álcool n-butílico (n-butanol)", "1-Butanol", grupos=[TINTAS], a11="Álcool n-butílico", sin=["n-Butyl alcohol"], d53=["1.2.11"], d83=SOLV83),
 a("alcool-isobutilico", "Álcool isobutílico (isobutanol)", "Isobutyl alcohol", grupos=[TINTAS], a11="Álcool isobutílico", d53=["1.2.11"], d83=SOLV83),
 a("alcool-sec-butilico", "Álcool sec-butílico (2-butanol)", "2-Butanol", grupos=[TINTAS], a11="Álcool sec-butílico (2-butanol)", sin=["sec-Butyl alcohol"], d53=["1.2.11"], d83=SOLV83),
 a("alcool-terc-butilico", "Álcool terc-butílico", "tert-Butanol", grupos=[TINTAS], a11="Álcool terc-butílico", sin=["tert-Butyl alcohol"], d53=["1.2.11"], d83=SOLV83),
 a("alcool-furfurilico", "Álcool furfurílico", "Furfuryl alcohol", grupos=[TINTAS], a11="Álcool furfurílico", d53=["1.2.11"]),
 a("alcool-n-propilico", "Álcool n-propílico (n-propanol)", "1-Propanol", grupos=[TINTAS], a11="Álcool n-propílico", sin=["n-Propyl alcohol"], d53=["1.2.11"], d83=SOLV83),
 a("alcool-isopropilico", "Álcool isopropílico (isopropanol)", "Isopropyl alcohol", grupos=[TINTAS], a11="Álcool isopropílico", d53=["1.2.11"], d83=SOLV83),
 a("amonia", "Amônia", "Ammonia", grupos=[GAS], a11="Amônia", d53=C9),
 a("argonio", "Argônio", "Argon", grupos=[GAS, SOLDA], a11="Argônio", obs=ASF),
 a("arsina", "Arsina (arsenamina)", "Arsine", grupos=[GAS, MET], a11="Arsina (arsenamina)", sin=["Hidrogênio arseniado"],
   d53=["1.2.1"], d83=["1.2.1:fam"], div=["1.0.1"]),
 a("brometo-de-etila", "Brometo de etila", "Ethyl bromide", grupos=[HAL], a11="Brometo de etila", d53=C11, d83=HAL83, div=BRO),
 a("n-butano", "n-Butano", "Butane", grupos=[GAS, COMB], a11="n-Butano", d53=C11, div=PET),
 a("n-butilamina", "n-Butilamina", "n-Butylamine", grupos=[OUT], a11="n-Butilamina", d53=C11),
 a("butil-cellosolve", "Butil cellosolve (2-butoxietanol)", "2-Butoxyethanol", grupos=[TINTAS], a11="Butil cellosolve", d53=C11, d83=SOLV83),
 a("n-butil-mercaptana", "n-Butil mercaptana (1-butanotiol)", "1-Butanethiol", grupos=[BOR, GAS], a11="n-Butil mercaptana", sin=["n-Butyl mercaptan"],
   d53=C11, div=["1.0.19:Grupo I – mercaptanos"]),
 a("cianogenio", "Cianogênio", "Cyanogen", grupos=[GAS], a11="Cianogênio", d53=C11),
 a("ciclohexano", "Ciclohexano", "Cyclohexane", grupos=[TINTAS], a11="Ciclohexano", d53=C11, div=PET),
 a("ciclohexanol", "Ciclohexanol", "Cyclohexanol", grupos=[TINTAS], a11="Ciclohexanol", d53=["1.2.11"]),
 a("ciclohexilamina", "Ciclohexilamina", "Cyclohexylamine", grupos=[OUT], a11="Ciclohexilamina", d53=C11),
 a("cloreto-de-etila", "Cloreto de etila (cloroetano)", "Ethyl chloride", grupos=[HAL], a11="Cloreto de etila", d53=C11, d83=HAL83, div=CLO),
 a("cloreto-de-vinilideno", "Cloreto de vinilideno (1,1-dicloroetileno)", "Vinylidene chloride", grupos=[HAL, BOR], a11="Cloreto de vinilideno", d53=C11, d83=HAL83, div=CLO),
 a("clorobenzeno", "Clorobenzeno", "Chlorobenzene", grupos=[HAL], a11="Clorobenzeno", d53=C11, d83=HAL83,
   div=["1.0.3:alínea e – produção e utilização de clorobenzenos e derivados", "1.0.9:fam"]),
 a("clorobromometano", "Clorobromometano", "Chlorobromomethane", grupos=[HAL], a11="Clorobromometano", d53=C11, d83=HAL83, div=CLO + BRO),
 a("freon-22", "Clorodifluormetano (freon 22)", "Chlorodifluoromethane", grupos=[HAL, GAS], a11="Clorodifluometano (freon 22)", sin=["Clorodifluometano"], d53=C11, d83=HAL83, div=CLO),
 a("1-cloro-1-nitropropano", "1-Cloro-1-nitropropano", "1-Chloro-1-nitropropane", grupos=[HAL], a11="1-Cloro 1-nitropropano", d53=C11, d83=HAL83, div=CLO),
 a("cumeno", "Cumeno (isopropilbenzeno)", "Cumene", grupos=[TINTAS, COMB], a11="Cumeno", d53=C11, d83=["1.2.10:fam"], div=PET),
 a("decaborano", "Decaborano", "Decaborane", grupos=[OUT], a11="Decaborano", d53=C9),
 a("demeton", "Demeton", "Demeton", grupos=[DEF], a11="Demeton", a13=ORGFOSF, d53=["1.2.11:fam"], d83=["1.2.6"], div=["1.0.12"]),
 a("diborano", "Diborano", "Diborane", grupos=[GAS], a11="Diborano", d53=C9),
 a("1-2-dibromoetano", "1,2-Dibromoetano (dibrometo de etileno)", "1,2-Dibromoethane", grupos=[HAL, DEF], a11="1,2-Dibramoetano", sin=["1,2-Dibramoetano", "Ethylene dibromide"],
   d53=C11, d83=HAL83, div=BRO),
 a("o-diclorobenzeno", "o-Diclorobenzeno", "1,2-Dichlorobenzene", grupos=[HAL], a11="o-Diclorobenzeno", sin=["o-Dichlorobenzene"], d53=C11, d83=HAL83,
   div=["1.0.3:alínea e – produção e utilização de clorobenzenos e derivados", "1.0.9:fam"]),
 a("freon-12", "Diclorodifluormetano (freon 12)", "Dichlorodifluoromethane", grupos=[HAL, GAS], a11="Diclorodifluormetano (freon 12)", d53=C11, d83=HAL83, div=CLO),
 a("1-1-dicloroetano", "1,1-Dicloroetano", "1,1-Dichloroethane", grupos=[HAL], a11="1,1 Dicloroetano", d53=C11, d83=HAL83, div=CLO),
 a("1-2-dicloroetileno", "1,2-Dicloroetileno", "1,2-Dichloroethylene", grupos=[HAL], a11="1,2 Dicloroetileno", d53=C11, d83=HAL83, div=CLO),
 a("1-1-dicloro-1-nitroetano", "1,1-Dicloro-1-nitroetano", "1,1-Dichloro-1-nitroethane", grupos=[HAL], a11="1,1 Dicloro-1-nitroetano", d53=C11, d83=HAL83, div=CLO),
 a("1-2-dicloropropano", "1,2-Dicloropropano", "1,2-Dichloropropane", grupos=[HAL], a11="1,2 Dicloropropano", sin=["Propylene dichloride"], d53=C11, d83=HAL83, div=CLO),
 a("freon-114", "Diclorotetrafluoretano (freon 114)", "1,2-Dichlorotetrafluoroethane", grupos=[HAL, GAS], a11="Diclorotetrafluoretano (freon 114)", sin=["Dichlorotetrafluoroethane"],
   d53=C11, d83=HAL83, div=CLO),
 a("dietilamina", "Dietilamina", "Diethylamine", grupos=[OUT], a11="Dietil amina", sin=["Dietil amina"], d53=C11),
 a("diisopropilamina", "Diisopropilamina", "Diisopropylamine", grupos=[OUT], a11="Diisopropilamina", d53=C11),
 a("dimetilacetamida", "Dimetilacetamida", "N,N-Dimethylacetamide", grupos=[TINTAS], a11="Dimetilacetamida", d53=C11),
 a("dimetilamina", "Dimetilamina", "Dimethylamine", grupos=[OUT], a11="Dimetilamina", d53=C11),
 a("dimetilformamida", "Dimetilformamida (DMF)", "N,N-Dimethylformamide", grupos=[TINTAS, PU], a11="Dimetiformamida", sin=["Dimetiformamida"], d53=C11, d83=SOLV83),
 a("1-1-dimetil-hidrazina", "1,1-Dimetil-hidrazina", "1,1-Dimethylhydrazine", grupos=[OUT], a11="1,1 Dimetil hidrazina", d53=C11),
 a("dioxido-de-carbono", "Dióxido de carbono", "Carbon dioxide", grupos=[GAS, SOLDA], a11="Dióxido de carbono"),
 a("dioxido-de-cloro", "Dióxido de cloro", "Chlorine dioxide", grupos=[GAS, HAL], a11="Dióxido de cloro", d53=C9, div=CLO),
 a("dioxido-de-enxofre", "Dióxido de enxofre", "Sulfur dioxide", grupos=[GAS], a11="Dióxido de enxofre", d53=C9),
 a("estibina", "Estibina (hidreto de antimônio)", "Stibine", grupos=[GAS, MET], a11="Estibina", d53=C9),
 a("etano", "Etano", "Ethane", grupos=[GAS, COMB], a11="Etano", d53=C11, div=PET, obs=ASF),
 a("eter-dicloroetilico", "Éter dicloroetílico (éter bis(2-cloroetílico))", "Bis(2-chloroethyl) ether", grupos=[HAL, CAN], a11="Éter decloroetílico",
   sin=["Éter decloroetílico", "Biscloroetiléter", "Dichloroethyl ether"], d53=C11, div=["1.0.19:Grupo II – grafado 'biscloroetileter'", "1.0.9:fam"]),
 a("eter-etilico", "Éter etílico (éter dietílico)", "Diethyl ether", grupos=[TINTAS], a11="Éter etílico", sin=["Ethyl ether"], d53=C11, d83=SOLV83),
 a("etilamina", "Etilamina", "Ethylamine", grupos=[OUT], a11="Etilamina", d53=C11),
 a("etilbenzeno", "Etilbenzeno", "Ethylbenzene", grupos=[TINTAS, COMB], a11="Etilbenzeno", d53=C11, d83=["1.2.10:fam"], div=PET,
   obs="O Anexo IV (2.172/97 e 3.048/99), código 1.0.19, Grupo II, lista 'ESTILBENZENO' – possível grafia de etilbenzeno; não atribuído (conferir)."),
 a("etileno", "Etileno", "Ethylene", grupos=[GAS], a11="Etileno", d53=C11, div=PET, obs=ASF),
 a("etil-mercaptana", "Etil mercaptana (etanotiol)", "Ethanethiol", grupos=[BOR, GAS], a11="Etil mercaptana", sin=["Ethyl mercaptan"], d53=C11, div=["1.0.19:Grupo I – mercaptanos"]),
 a("n-etilmorfolina", "N-Etilmorfolina", "4-Ethylmorpholine", grupos=[PU], a11="n-Etil morfolina", sin=["n-Etil morfolina", "N-Ethylmorpholine"], d53=C11),
 a("2-etoxietanol", "2-Etoxietanol (cellosolve)", "2-Ethoxyethanol", grupos=[TINTAS], a11="2-Etoxietanol", d53=C11, d83=SOLV83),
 a("freon-11", "Fluortriclorometano (freon 11)", "Trichlorofluoromethane", grupos=[HAL, PU], a11="Fluortriclorometano (freon 11)", d53=C11, d83=HAL83, div=CLO),
 a("fosfina", "Fosfina (fosfamina)", "Phosphine", grupos=[GAS, DEF], a11="Fosfina (fosfamina)", d53=["1.2.6:fam"], d83=["1.2.6:fam"], div=["1.0.12:fam"]),
 a("fosgenio", "Fosgênio (cloreto de carbonila)", "Phosgene", grupos=[GAS, HAL], a11="Fosgênio", d53=C9, div=CLO),
 a("helio", "Hélio", "Helium", grupos=[GAS], a11="Hélio", obs=ASF),
 a("hidrazina", "Hidrazina", "Hydrazine", grupos=[OUT], a11="Hidrazina", d53=C9),
 a("hidrogenio", "Hidrogênio", "Hydrogen", grupos=[GAS], a11="Hidrogênio", obs=ASF),
 a("isopropilamina", "Isopropilamina", "Isopropylamine", grupos=[OUT], a11="Isopropilamina", d53=C11),
 a("metilamina", "Metilamina", "Methylamine", grupos=[OUT], a11="Metilamina", d53=C11),
 a("metil-cellosolve", "Metil cellosolve (2-metoxietanol)", "2-Methoxyethanol", grupos=[TINTAS], a11="Metil cellosolve", d53=C11, d83=SOLV83),
 a("metilciclohexanol", "Metilciclohexanol", "Methylcyclohexanol", grupos=[TINTAS], a11="Metil ciclohexanol", sin=["Metil ciclohexanol"], d53=["1.2.11"]),
 a("metilcloroformio", "Metilclorofórmio (1,1,1-tricloroetano)", "1,1,1-Trichloroethane", grupos=[HAL, MEC], a11="Metilclorofórmio", sin=["Methyl chloroform"], d53=C11, d83=HAL83, div=CLO),
 a("metil-demeton", "Metil demeton", "Methyl demeton", grupos=[DEF], a11="Metil demeton", a13=ORGFOSF, d53=["1.2.11:fam"], d83=["1.2.6"], div=["1.0.12"]),
 a("metil-isobutil-carbinol", "Metil isobutil carbinol", "Methyl isobutyl carbinol", grupos=[TINTAS], a11="Metil isobutilcarbinol", sin=["4-Metil-2-pentanol"], d53=["1.2.11"]),
 a("monometil-hidrazina", "Monometil-hidrazina", "Methylhydrazine", grupos=[OUT], a11="Monometil hidrazina", d53=C11),
 a("neonio", "Neônio", "Neon", grupos=[GAS], a11="Neônio", obs=ASF),
 a("nitrato-de-n-propila", "Nitrato de n-propila", "Propyl nitrate", grupos=[OUT], a11="Nitrato de n-propila", sin=["n-Propyl nitrate"], d53=C11),
 a("nitroetano", "Nitroetano", "Nitroethane", grupos=[TINTAS], a11="Nitroetano", d53=C11),
 a("nitrometano", "Nitrometano", "Nitromethane", grupos=[TINTAS, COMB], a11="Nitrometano", d53=C11),
 a("1-nitropropano", "1-Nitropropano", "1-Nitropropane", grupos=[TINTAS], a11="1 - Nitropropano", d53=C11),
 a("2-nitropropano", "2-Nitropropano", "2-Nitropropane", grupos=[TINTAS], a11="2 - Nitropropano", d53=C11),
 a("oxido-nitrico", "Óxido nítrico (monóxido de nitrogênio)", "Nitric oxide", grupos=[GAS, SOLDA], a11="Óxido nítrico (NO)", d53=C9),
 a("pentaborano", "Pentaborano", "Pentaborane", grupos=[OUT], a11="Pentaborano", d53=C9),
 a("percloroetileno", "Percloroetileno (tetracloroetileno)", "Tetrachloroethylene", grupos=[HAL, MEC], a11="Percloroetíleno", sin=["Percloroetíleno", "Perchloroethylene"],
   d53=C11, d83=HAL83, div=CLO),
 a("piridina", "Piridina", "Pyridine", grupos=[OUT], a11="Piridina", d53=C11),
 a("propano", "Propano", "Propane", grupos=[GAS, COMB], a11="n-propano", sin=["n-Propano", "GLP (componente)"], d53=C11, div=PET, obs=ASF),
 a("propileno", "Propileno", "Propylene", grupos=[GAS], a11="Propileno", sin=["Propeno"], d53=C11, div=PET, obs=ASF),
 a("propilenoimina", "Propilenoimina", "Propyleneimine", grupos=[CAN], a11="Propileno imina", sin=["Propileno imina", "2-Metilaziridina"], d53=C11),
 a("tetrabromoetano", "1,1,2,2-Tetrabromoetano", "1,1,2,2-Tetrabromoethane", grupos=[HAL], a11="1,1,2,2,Tetrabromoetano", sin=["Acetylene tetrabromide"], d53=C11, d83=HAL83, div=BRO),
 a("tetrahidrofurano", "Tetrahidrofurano", "Tetrahydrofuran", grupos=[TINTAS], a11="Tetrahidrofurano", d53=C11, d83=SOLV83),
 a("1-1-2-tricloroetano", "1,1,2-Tricloroetano", "1,1,2-Trichloroethane", grupos=[HAL], a11="1,1,2 Tricloroetano", d53=C11, d83=HAL83, div=CLO),
 a("1-2-3-tricloropropano", "1,2,3-Tricloropropano", "1,2,3-Trichloropropane", grupos=[HAL], a11="1,2,3 Tricloropropano", d53=C11, d83=HAL83, div=CLO),
 a("freon-113", "1,1,2-Tricloro-1,2,2-trifluoretano (freon 113)", "1,1,2-Trichloro-1,2,2-trifluoroethane", grupos=[HAL, MEC], a11="1,1,2 Tricloro-1,2,2 trifluoretano (freon 113)",
   d53=C11, d83=HAL83, div=CLO),
 a("trietilamina", "Trietilamina", "Triethylamine", grupos=[PU], a11="Trietilamina", d53=C11),
 a("trifluorbromometano", "Trifluormonobromometano (bromotrifluormetano)", "Bromotrifluoromethane", grupos=[HAL, GAS], a11="Trifluormonobramometano",
   sin=["Trifluormonobramometano", "Halon 1301"], d53=C11, d83=HAL83, div=BRO),
 # ---------------- Anexos 12/13/13-A (agentes citados nas atividades) e decretos
 a("antraceno", "Antraceno", "Anthracene", grupos=[COMB], a13=[(HC, "antraceno")], d53=C11, d83=["1.2.10:fam"], div=["1.0.7"], origem="Anexo 13"),
 a("cresol", "Cresóis (mistura de isômeros)", "Cresol", tipo="mistura", grupos=[TINTAS], sin=["Cresol", "Cresylic acid"], a13=[(HC, "cresóis"), (HC, "cresol")], d53=C11,
   origem="Anexo 13", npgNota="O NIOSH Pocket Guide não tem página para a mistura; há páginas para o-cresol (npgd0154), m-cresol (npgd0155) e p-cresol (npgd0156)."),
 a("naftois", "Naftóis (1-naftol e 2-naftol)", None, tipo="grupo/fumos", grupos=[TINTAS], sin=["Naftol", "Naphthols"], a13=[(HC, "naftóis")], d53=C11, origem="Anexo 13",
   obs="Grupo citado no Anexo 13 (fabricação de naftóis); sem CAS único."),
 a("ddd", "DDD (diclorodifenildicloroetano)", "p,p'-DDD", grupos=[DEF, HAL], sin=["Diclorodifenildicloretano", "TDE"], a13=[(HC, "organoclorados")], d53=C11, d83=["1.2.10"], div=["1.0.9"], origem="Anexo 13"),
 a("metoxicloro", "Metoxicloro", "Methoxychlor", grupos=[DEF, HAL], sin=["Dimetoxidifeniltricloretano"], a13=[(HC, "organoclorados")], d53=C11, d83=["1.2.10"], div=["1.0.9"], origem="Anexo 13"),
 a("mercurio-organico", "Mercúrio – compostos orgânicos (alquilmercúrio)", None, tipo="grupo/fumos", grupos=[MET], sin=["Compostos orgânicos de mercúrio", "Mercury (organo) alkyl compounds"],
   a13=[("MERCÚRIO", None)], d53=["1.2.8"], d83=["1.2.8"], div=["1.0.15"], origem="Anexo 13", npg="0384",
   obs="Compostos orgânicos de mercúrio: Anexo 13 (o Anexo 11 exclui as formas orgânicas)."),
 a("cromo-metal-iii", "Cromo metálico e compostos de cromo III", "Chromium", grupos=[MET], sin=["Cromo trivalente", "Chromium metal"], a13=[("CROMO", "tanagem"), ("CROMO", "cromagem")],
   d53=["1.2.5"], d83=["1.2.5:fam"], div=["1.0.10"], origem="Anexo 13", obs="Anexo 13 (cromo): conferir a valência do composto na atividade."),
 a("chumbo-tetraetila", "Chumbo tetraetila", "Tetraethyl lead", grupos=[COMB, MET], sin=["Tetraetilchumbo", "TEL"], a13=[("CHUMBO", "tetraetila")],
   d53=["1.2.4"], d83=["1.2.4"], div=["1.0.8"], origem="Anexo 13"),
 a("chumbo-tetrametila", "Chumbo tetrametila", "Tetramethyl lead", grupos=[COMB, MET], sin=["Tetrametilchumbo", "TML"], a13=[("CHUMBO", "tetrametila")],
   d53=["1.2.4"], d83=["1.2.4"], div=["1.0.8"], origem="Anexo 13"),
 a("hidroxido-de-potassio", "Hidróxido de potássio (potassa cáustica)", "Potassium hydroxide", grupos=[ACI], sin=["Potassa cáustica", "KOH"], a13=[(OPD, "álcalis cáusticos")], d53=C9, origem="Anexo 13"),
 a("emetina", "Emetina (ipeca)", "Emetine", grupos=[OUT], sin=["Ipecacuanha"], a13=[(OPD, "emetina")], d53=C11, origem="Anexo 13"),
 a("rotenona", "Timbó (rotenona)", "Rotenone", grupos=[DEF], sin=["Timbó", "Rotenona"], a13=[(OPD, "timbó")], d53=C11, origem="Anexo 13",
   obs="Anexo 13: 'operações com o timbó' – a rotenona é o princípio ativo (conferir)."),
 a("enxofre", "Enxofre e sulfitos", "Sulfur", grupos=[POE], sin=["Enxofre", "Sulfur"], a13=[(OPD, "enxofre")], d53=C9, origem="Anexo 13",
   obs="Dados de identificação do enxofre elementar; o Anexo 13 inclui os sulfitos em geral."),
 a("escoria-de-thomas", "Escórias de Thomas (escória básica)", None, tipo="grupo/fumos", grupos=[POE], sin=["Escória de Thomas", "Basic slag"], a13=[(OPD, "Thomás")], origem="Anexo 13"),
 a("bagaco-de-cana", "Poeira de bagaço de cana", None, tipo="grupo/fumos", grupos=[POE], sin=["Bagaço de cana", "Bagaçose"], a13=[(OPD, "bagaço")], origem="Anexo 13"),
 a("oleo-queimado", "Óleo lubrificante usado (óleo queimado)", None, tipo="mistura", grupos=[OLEOS, MEC], sin=["Óleo queimado", "Used mineral oil"], a13=[(HC, "óleo queimado")],
   d53=C11, div=["1.0.7:fam"], origem="Anexo 13"),
 a("mostardas-nitrogenadas", "Mostardas nitrogenadas (cloroetilaminas)", None, tipo="grupo/fumos", grupos=[CAN, HAL], sin=["Cloroetilaminas", "Nitrogen mustards"],
   d53=C11, div=["1.0.9"], origem="Decretos", obs="Anexo IV, 1.0.9, alínea b (fabricação e emprego de cloroetilaminas)."),
 a("butadieno-estireno", "Butadieno-estireno (copolímero)", None, tipo="mistura", grupos=[BOR], sin=["SBR", "Styrene-butadiene"], d53=C11, d83=["1.2.10:fam"],
   div=["1.0.19:Grupo I"], origem="Decretos"),
 a("nitronaftilamina", "Nitronaftilamina", None, grupos=[CAN], d53=C11, div=["1.0.19:Grupo II"], origem="Decretos",
   obs="Nome como no Anexo IV (1.0.19, Grupo II); composto não identificado de forma unívoca – CAS em branco."),
 a("etilnitrosoureias", "Etilnitrosoureias (N-etil-N-nitrosoureia)", "N-Ethyl-N-nitrosourea", grupos=[CAN], sin=["Etilnitrosuréias", "ENU"], d53=C11,
   div=["1.0.19:Grupo II"], origem="Decretos", obs="O Anexo IV cita 'etilnitrosuréias' (plural); dados de identificação da N-etil-N-nitrosoureia."),
]

# Linhas do Quadro n.º 1 que correspondem a agentes já existentes (os demais casam pelo nome/sinônimo)
MAPA_A11 = {"Ácido crômico (névoa)": "acido-cromico-nevoa", "Cloroprene": "cloropreno", "Tetracloroetano": "tetracloroetano", "Benzeno": "benzeno"}
# Nomes em inglês para buscar o CAS de agentes existentes sem CAS (só substâncias definidas)
EN_EXIST = {"ouro": "Gold", "metano": "Methane", "oximetolona": "Oxymetholone", "procarbazina": "Procarbazine"}
# Agentes em que a busca por CAS na IARC não deve atribuir grupo (entrada é de consumo/exposição não ocupacional)
IARC_IGNORA = {"etanol"}


def fonte(campos, ref, url, nota=None):
    f = {"campos": campos, "referencia": ref, "url": url, "consultadoEm": DATA}
    if nota:
        f["nota"] = nota
    return f


def vazio_fis():
    return dict.fromkeys(["estado", "pontoEbulicao", "pontoFusao", "pressaoVapor", "densidadeRelativa", "densidadeVapor", "solubilidadeAgua",
                          "pontoFulgor", "lie", "lse", "autoignicao", "limiarOdor"], "")


def vazio_nio():
    return dict.fromkeys(["rel", "idlh", "oshaPel", "vias", "orgaosAlvo", "sintomas", "metodos", "url"], "")


def main():
    semear()
    global IDX
    IDX = indice_niosh()
    base = json.load(open(BASE, encoding="utf-8"))
    ids_novos = {x["id"] for x in NOVOS}
    antigos = [x for x in base["agentes"] if x["id"] not in ids_novos]
    rel = {"avisos": [], "pc_nome": {}}
    PC_SET.clear(); NIO_MW.clear()

    # ---- novos: esqueleto + NR-15 + decretos
    novos = []
    for n in NOVOS:
        ag = dict(id=n["id"], nome=n["nome"], sinonimos=list(n["sinonimos"]) + ([n["en"]] if n.get("en") and n["en"] not in n["sinonimos"] else []),
                  cas="", grupos=n["grupos"], tipo=n["tipo"], formula="", massaMolar="", fisico=vazio_fis(), niosh=vazio_nio(), linach="", iarc="", fontes=[])
        ag["codDecretos"] = AMP.texto_decretos(n["d53"], n["d83"], n["div"])
        ag["fontes"].append(fonte("códigos nos decretos previdenciários",
                                  "BRASIL. Decreto nº 53.831/1964, quadro anexo; Decreto nº 83.080/1979, Anexo I; Decretos nº 2.172/1997 e 3.048/1999, Anexo IV – tools/dados/decretos-quimicos.json",
                                  "https://www2.camara.leg.br/legin/fed/decret/1999/decreto-3048-6-maio-1999-368532-normaatualizada-pe.html"))
        regra = {k: n[k] for k in ("a11", "a12", "a13", "a13a") if n.get(k)}
        if n.get("nota"):
            regra["nota"] = n["nota"]
        AMP.classificar(ag, regra)
        ag["observacoes"] = n.get("obs", "")
        ag["situacao"] = "A conferir"
        ag["_n"] = n
        novos.append(ag)
    todos = antigos + novos
    porid = {x["id"]: x for x in todos}

    # ---- cobertura do Quadro n.º 1 + sinônimos de remissão
    idx = {}
    for x in todos:
        for s in [x["nome"], re.sub(r"\(.*?\)", "", x["nome"])] + x["sinonimos"]:
            idx.setdefault(norm(s), set()).add(x["id"])
    cobertura = {}
    for l in AMP.A11:
        alvo = MAPA_A11.get(l["n"])
        if not alvo:
            alvo = next((x["id"] for x in novos if x["_n"].get("a11") == l["n"]), None)
        if not alvo:
            hits = set()
            for k in [l["n"], re.sub(r"\(.*?\)", "", l["n"])] + l.get("vide", []) + l.get("al", []):
                hits |= idx.get(norm(k), set())
            if len(hits) == 1:
                alvo = hits.pop()
            elif hits:
                rel["avisos"].append(f"Quadro 1 '{l['n']}': casamento ambíguo {sorted(hits)}")
        cobertura[l["n"]] = alvo
        if not alvo:
            rel["avisos"].append(f"Quadro 1 '{l['n']}': sem agente")
            continue
        ag = porid[alvo]
        for s in l.get("vide", []) + l.get("al", []) + ([l["n"]] if norm(l["n"]) != norm(ag["nome"]) and alvo in MAPA_A11.values() else []):
            if norm(s) not in {norm(y) for y in [ag["nome"]] + ag["sinonimos"]}:
                ag["sinonimos"].append(s)

    # ---- identificação (CAS, fórmula, massa molar) pelo PubChem
    for ag in todos:
        n = ag.get("_n") or {}
        en = n.get("en") or EN_EXIST.get(ag["id"])
        if not ag["cas"] and en and ag["tipo"] != "grupo/fumos":
            pc = pubchem(en, por_nome=True)
            # conferência com o índice do NIOSH (pelo nome em inglês)
            nio = [(c, p) for c, p, nm in IDX if norm(re.sub(r"\(.*?\)", "", nm)) == norm(en) or norm(nm) == norm(en)]
            cas_ni = re.split(r"\s", nio[0][0])[0] if nio else ""
            if not pc:
                if cas_ni:  # CAS pelo índice do NIOSH (a página é lida adiante e registrada como fonte)
                    ag["cas"] = cas_ni
                    rel["avisos"].append(f"{ag['id']}: PubChem sem resultado para '{en}'; CAS {cas_ni} do índice NIOSH")
                else:
                    rel["avisos"].append(f"{ag['id']}: PubChem sem resultado para '{en}'")
                continue
            cas_pc = pc["cas_sin"][0] if pc["cas_sin"] else ""
            if cas_ni and cas_pc and cas_ni != cas_pc and cas_ni in pc["cas_sin"]:
                cas_pc = cas_ni
            if cas_ni and cas_pc and cas_ni != cas_pc:
                rel["avisos"].append(f"{ag['id']}: CAS PubChem {cas_pc} ≠ NIOSH {cas_ni} – usado o do PubChem")
            ag["cas"] = cas_pc
            rel["pc_nome"][ag["id"]] = (en, pc["titulo"], cas_pc)
            if ag["tipo"] == "substância":
                ag["formula"], ag["massaMolar"] = pc["formula"], pc["mw"] + " g/mol"
                PC_SET[ag["id"]] = pc
                campos = "identificação (CAS), fórmula e massa molar"
            else:
                campos = "identificação (CAS)"
            ag["fontes"].insert(0, fonte(campos, f"PubChem, CID {pc['cid']} ({pc['titulo']}) – busca pelo nome '{en}'; CAS = sinônimo no formato CAS",
                                         f"https://pubchem.ncbi.nlm.nih.gov/compound/{pc['cid']}"))
        elif ag["cas"] and ag["tipo"] == "substância" and (not ag["formula"] or not ag["massaMolar"]):
            pc = pubchem(ag["cas"])
            if not pc:
                rel["avisos"].append(f"{ag['id']}: PubChem sem registro para o CAS {ag['cas']}")
                continue
            if ag["cas"] not in pc["cas_sin"]:
                rel["avisos"].append(f"{ag['id']}: CAS {ag['cas']} não está entre os sinônimos do CID {pc['cid']}")
            if not ag["formula"]:
                ag["formula"] = pc["formula"]
            if not ag["massaMolar"]:
                ag["massaMolar"] = pc["mw"] + " g/mol"
                PC_SET[ag["id"]] = pc
            ag["fontes"].insert(0, fonte("fórmula e massa molar", f"PubChem, CID {pc['cid']} ({pc['titulo']}) – busca pelo CAS {ag['cas']}",
                                         f"https://pubchem.ncbi.nlm.nih.gov/compound/{pc['cid']}"))

    # ---- NIOSH Pocket Guide
    faltam_npg = []
    for ag in todos:
        n = ag.get("_n") or {}
        if ag["niosh"].get("url"):
            continue
        pid, nota = n.get("npg"), n.get("npgNota")
        if not pid and ag["id"] == "manganes-poeira":
            pid = "0379"
        if not pid and ag["cas"]:
            hs = npg_por_cas(ag["cas"])
            if len(hs) == 1:
                pid = hs[0][0]
            elif len(hs) > 1:
                rel["avisos"].append(f"{ag['id']}: várias páginas NIOSH com o CAS {ag['cas']}: {hs} – não atribuído")
        if not pid:
            if nota:
                ag["fontes"].append(fonte("bloco niosh", "NIOSH Pocket Guide to Chemical Hazards – índice por CAS", NPG + "npgdcas.html", nota))
            continue
        ni = niosh_pagina(pid)
        if not ni:
            faltam_npg.append((pid, ag["id"]))
            continue
        if ag["cas"] and ag["cas"] not in ni["cas"] and not n.get("npg"):
            rel["avisos"].append(f"{ag['id']}: CAS {ag['cas']} não aparece na página NIOSH {pid} ({ni['cas']})")
        for k, v in ni["fis"].items():
            if v and not ag["fisico"].get(k):
                ag["fisico"][k] = v
        for k, v in dict(rel=ni["rel"], idlh=ni["idlh"], oshaPel=ni["pel"], vias=ni["vias"], orgaosAlvo=ni["orgaos"], sintomas=ni["sint"],
                         metodos=ni["metodos"], url=ni["url"]).items():
            if v and not ag["niosh"].get(k):
                ag["niosh"][k] = v
        NIO_MW[ag["id"]] = ni.get("mw", "")
        if not ag["massaMolar"] and ni.get("mw") and re.match(r"^[\d.]", ni["mw"]) and ag["tipo"] != "grupo/fumos":
            ag["massaMolar"] = ni["mw"] + " g/mol (NIOSH)"
        orig = "tools/dados/niosh-npg-2026-11-16.json (campos copiados da página)" if ni.get("arquivo") else "página HTML"
        ag["fontes"].append(fonte("propriedades físico-químicas e bloco niosh", f"NIOSH Pocket Guide to Chemical Hazards – {ni['nome']} (CAS na página: {ni['cas'] or '—'})",
                                  ni["url"], "; ".join(x for x in [nota, "Leitura: " + orig] if x)))
    if "--listar-niosh" in sys.argv:
        for pid, i in faltam_npg:
            print(f"FALTA npgd{pid} ({i})")
        return

    # ---- conferência PubChem × NIOSH (massa molar): registro do PubChem incoerente é descartado
    for ag in todos:
        pc = PC_SET.get(ag["id"])
        ni_mw = NIO_MW.get(ag["id"], "")
        if not pc or not re.match(r"^\d+(\.\d+)?$", ni_mw):
            continue
        if abs(float(pc["mw"]) - float(ni_mw)) > max(1.0, 0.02 * float(ni_mw)):
            rel["avisos"].append(f"{ag['id']}: PubChem CID {pc['cid']} ('{pc['titulo']}', {pc['formula']}, {pc['mw']}) incoerente com o NIOSH (MW {ni_mw}) – descartado")
            ag["formula"], ag["massaMolar"] = "", ni_mw + " g/mol (NIOSH)"
            ag["fontes"] = [f for f in ag["fontes"] if f"CID {pc['cid']} " not in f["referencia"]]
            for f in ag["fontes"]:
                if f["campos"] == "propriedades físico-químicas e bloco niosh":
                    f["campos"] = "CAS, massa molar, propriedades físico-químicas e bloco niosh"

    # ---- IARC (pelo CAS)
    IA = G.iarc_lista() or []
    for ag in todos:
        if ag["iarc"] or not ag["cas"] or ag["id"] in IARC_IGNORA:
            continue
        hs = [e for e in IA if ag["cas"] in e["cas"] and not NAO_ATRIBUIR.search(e["nome"])]
        f_old = next((f for f in ag["fontes"] if f["campos"] == "iarc"), None)
        resto = ""
        if f_old and "Entradas relacionadas" in f_old.get("nota", ""):
            resto = " " + f_old["nota"][f_old["nota"].find("Entradas relacionadas"):]
        if len({e["grupo"] for e in hs}) == 1:
            ag["iarc"] = "Grupo " + hs[0]["grupo"]
            nota = f"Entrada usada (pelo CAS {ag['cas']}): '{hs[0]['nome']}'." + resto
        elif hs:
            nota = "Várias entradas com o CAS, grupos diferentes: " + "; ".join(f"'{e['nome']}' – Grupo {e['grupo']}" for e in hs) + " – não atribuído." + resto
            rel["avisos"].append(f"{ag['id']}: IARC ambíguo")
        else:
            nota = f"Nenhuma entrada na lista para o CAS {ag['cas']}." + resto
        ag["fontes"] = [f for f in ag["fontes"] if f["campos"] != "iarc"] + [fonte("iarc", "IARC Monographs – List of Classifications", IARC_URL, nota.strip())]
    for ag in novos:
        if not any(f["campos"] == "iarc" for f in ag["fontes"]):
            ag["fontes"].append(fonte("iarc", "IARC Monographs – List of Classifications", IARC_URL, "Agente sem CAS: não buscado na lista."))

    # ---- LINACH (pelo CAS, Grupos 1, 2A e 2B)
    LI = linach_lista()
    ref_li = ("BRASIL. Portaria Interministerial MTE/MS/MPS nº 9, de 7 de outubro de 2014 (LINACH), Anexo – Grupos 1, 2A e 2B. "
              "Diário Oficial da União, 8 out. 2014 (texto extraído da cópia oficial)")
    if LI is not None:
        for ag in todos:
            if ag["linach"]:
                continue
            f_old = next((f for f in ag["fontes"] if f["campos"] == "linach"), None)
            resto = ""
            if f_old and "Entradas relacionadas" in f_old.get("nota", ""):
                resto = " " + f_old["nota"][f_old["nota"].find("Entradas relacionadas"):]
            if not ag["cas"]:
                nota = "Agente sem CAS: não buscado pelo CAS." + resto
            else:
                hs = [(g, nm) for g, nm, c in LI if c == ag["cas"]]
                ok = [(g, nm) for g, nm in hs if not NAO_ATRIBUIR.search(nm)]
                if len({g for g, _ in ok}) > 1:
                    nomes = {norm(y) for y in [ag["nome"]] + ag["sinonimos"]}
                    ok = [(g, nm) for g, nm in ok if norm(nm) in nomes]
                if ok and len({g for g, _ in ok}) == 1:
                    ag["linach"] = "Grupo " + ok[0][0]
                    nota = f"Entrada usada (pelo CAS {ag['cas']}): '{ok[0][1][:120]}'."
                elif hs:
                    nota = "Entradas com o CAS não atribuídas: " + "; ".join(f"'{nm[:80]}' – Grupo {g}" for g, nm in hs) + "."
                    rel["avisos"].append(f"{ag['id']}: LINACH não atribuído ({nota})")
                else:
                    nota = f"CAS {ag['cas']} não consta dos Grupos 1, 2A e 2B."
                nota += resto
            ag["fontes"] = [f for f in ag["fontes"] if f["campos"] != "linach"] + [fonte("linach", ref_li, "", nota.strip())]

    # ---- fechamento
    for ag in novos:
        n = ag.pop("_n")
        obs = [ag.get("observacoes", "")] if ag.get("observacoes") else []
        if not ag["cas"]:
            obs.append("CAS em branco: conferir.")
        ag["observacoes"] = " ".join(obs)
        ordem = ["id", "nome", "sinonimos", "cas", "grupos", "tipo", "formula", "massaMolar", "fisico", "niosh", "nr15", "linach", "iarc",
                 "fontes", "situacao", "codDecretos", "observacoes"]
        ag_ord = {k: ag[k] for k in ordem if k in ag}
        ag.clear(); ag.update(ag_ord)
    for ag in todos:
        ag["situacao"] = "A conferir"
        o = ag.get("observacoes", "")
        if ag["cas"]:  # observações que ficaram superadas pelo preenchimento
            o = o.replace("; CAS não conferido nesta inclusão.", ".").replace(" CAS em branco: conferir.", "").replace("CAS em branco: conferir.", "")
        if ag["niosh"].get("url"):
            o = re.sub(r"\s*Sem página no NIOSH Pocket Guide[^.]*\.", "", o)
        ag["observacoes"] = o.strip()
    base["agentes"] = antigos + novos
    base["versao"] = VERSAO
    base["descricao"] = ("Base de agentes químicos – fontes abertas; todos os agentes do Quadro n.º 1 do Anexo 11 e dos Anexos 12, 13 e 13-A da NR-15 "
                         "e dos decretos previdenciários (53.831/64, 83.080/79, 2.172/97 e 3.048/99); conferir antes de usar em laudo")
    with open(BASE, "w", encoding="utf-8") as f:
        json.dump(base, f, ensure_ascii=False, indent=1)
    # ---- relatório
    from collections import Counter
    print(f"{len(antigos)} existentes + {len(novos)} novos = {len(base['agentes'])}")
    print("novos por origem:", dict(Counter((x.get("origem") or "Anexo 11") for x in NOVOS)))
    sem_ag = [k for k, v in cobertura.items() if not v]
    print("linhas do Quadro 1 sem agente:", sem_ag)
    for campo in ("cas", "formula", "massaMolar", "linach", "iarc"):
        falt = [x["id"] for x in base["agentes"] if not x[campo] and not (campo == "formula" and x["tipo"] != "substância")]
        print(f"sem {campo} ({len(falt)}):", ", ".join(falt))
    falt = [x["id"] for x in base["agentes"] if not x["niosh"].get("url")]
    print(f"sem página NIOSH ({len(falt)}):", ", ".join(falt))
    for pid, i in faltam_npg:
        print(f"NIOSH npgd{pid} ({i}): página não lida (cdc.gov bloqueado e sem cópia em cache/arquivo de dados)")
    for i, (en, t, c) in rel["pc_nome"].items():
        print(f"PubChem nome: {i}: '{en}' → '{t}' CAS {c}")
    for x in rel["avisos"]:
        print("AVISO:", x)


if __name__ == "__main__":
    main()

"""
Exporta TODOS os casos e fotos do app antigo (Streamlit) para um arquivo ZIP.

- Apenas LÊ o Firebase; nada é alterado ou apagado.
- O ZIP serve como backup do app antigo e pode ser importado no app novo
  (Configurações → Trazer casos do app antigo → Importar ZIP).

Como usar (no mesmo ambiente onde o app antigo roda, ex.: GitHub Codespaces):
    pip install firebase-admin toml
    python exportar_app_antigo.py caminho/para/.streamlit/secrets.toml

Gera: backup_app_antigo_AAAAMMDD_HHMM.zip
"""
import base64
import hashlib
import json
import sys
import zipfile
from datetime import datetime

import firebase_admin
import toml
from firebase_admin import credentials, firestore, storage


def main():
    caminho = sys.argv[1] if len(sys.argv) > 1 else ".streamlit/secrets.toml"
    segredos = toml.load(caminho)
    fb = dict(segredos["firebase"])
    bucket_nome = str(fb.pop("storage_bucket", "") or "").strip()
    fb["private_key"] = fb["private_key"].replace("\\n", "\n")
    app = firebase_admin.initialize_app(
        credentials.Certificate(fb), {"storageBucket": bucket_nome} if bucket_nome else None
    )
    db = firestore.client()
    bucket = storage.bucket(app=app) if bucket_nome else None

    saida = f"backup_app_antigo_{datetime.now():%Y%m%d_%H%M}.zip"
    processos = {}
    total_fotos = falhas = 0
    with zipfile.ZipFile(saida, "w", zipfile.ZIP_STORED) as z:
        for doc in db.collection("processos").stream():
            dados = doc.to_dict() or {}
            fotos = []
            for i, foto in enumerate(dados.get("campo_fotos") or []):
                if not isinstance(foto, dict):
                    continue
                foto = dict(foto)
                conteudo = None
                try:
                    if foto.get("base64"):
                        conteudo = base64.b64decode(foto.pop("base64"))
                    elif foto.get("storage_path") and bucket is not None:
                        conteudo = bucket.blob(foto["storage_path"]).download_as_bytes()
                except Exception as exc:  # noqa: BLE001
                    print(f"  ! foto {i + 1} de {doc.id}: {exc}")
                    falhas += 1
                if conteudo:
                    nome = f"fotos/{doc.id}_{i + 1:03d}_{hashlib.sha1(conteudo).hexdigest()[:8]}.jpg"
                    z.writestr(nome, conteudo)
                    foto["arquivo_zip"] = nome
                    total_fotos += 1
                fotos.append(foto)
            dados["campo_fotos"] = fotos
            processos[doc.id] = dados
            print(f"✔ {doc.id}: {dados.get('reclamante_nome', 'sem nome')} ({len(fotos)} fotos)")
        z.writestr(
            "processos.json",
            json.dumps(processos, ensure_ascii=False, indent=1, default=str),
        )
    print(f"\n{len(processos)} casos, {total_fotos} fotos exportadas, {falhas} falhas → {saida}")


if __name__ == "__main__":
    main()

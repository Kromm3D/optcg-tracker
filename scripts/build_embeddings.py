#!/usr/bin/env python3
"""
build_embeddings.py
-------------------
Genera la base de datos de embeddings de arte para el escáner neuronal.

Pipeline:
  1. Carga MobileNetV2 preentrenado (ImageNet, torchvision).
  2. Extrae embeddings de 1280 dims para las 4571 imágenes de cartas.
  3. Ajusta PCA para reducir a N_COMPONENTS dims y L2-normaliza.
  4. Exporta un modelo ONNX combinado: imagen 224×224 → embedding N-dim.
  5. Guarda data/embeddings.json (variantKey → vector) y data/model.onnx.

El modelo ONNX se copia a app/assets/ para que sea accesible en la app.
Los embeddings se copian a app/src/data/ como el resto de assets bundleados.

USO:
    pip install torch torchvision onnxruntime scikit-learn pillow numpy
    python scripts/build_embeddings.py
    python scripts/build_embeddings.py --components 64   # dims de PCA
    python scripts/build_embeddings.py --no-quant        # sin cuantización
"""

import argparse
import io
import json
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image as PILImage

try:
    import torch
    import torch.nn as nn
    import torch.nn.functional as F
    from torchvision.models import mobilenet_v2, MobileNet_V2_Weights
except ImportError:
    print("[!] Falta 'torch' / 'torchvision'. Instálalos con:")
    print("    pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu")
    sys.exit(1)

try:
    import onnxruntime as ort
except ImportError:
    print("[!] Falta 'onnxruntime'. Instálalo con:  pip install onnxruntime")
    sys.exit(1)

try:
    from sklearn.decomposition import PCA
    from sklearn.preprocessing import normalize
except ImportError:
    print("[!] Falta 'scikit-learn'. Instálalo con:  pip install scikit-learn")
    sys.exit(1)

# ---------------------------------------------------------------------------
# Configuración
# ---------------------------------------------------------------------------
ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
INDEX_PATH = DATA_DIR / "index.json"
IMAGES_DIR = ROOT / "images"

MODEL_ONNX_PATH = DATA_DIR / "model.onnx"
EMBEDDINGS_PATH = DATA_DIR / "embeddings.json"

# Destinos en la app
APP_ASSETS_DIR = ROOT / "app" / "assets"
APP_DATA_DIR = ROOT / "app" / "src" / "data"

N_COMPONENTS_DEFAULT = 64    # dims de PCA (equilibrio tamaño / discriminación)
MOBILENET_INPUT = 224        # resolución de entrada del modelo

# Normalización ImageNet (RGB)
IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
IMAGENET_STD  = np.array([0.229, 0.224, 0.225], dtype=np.float32)


# ---------------------------------------------------------------------------
# Preprocesado de imagen → tensor float32 (1, 3, 224, 224)
# ---------------------------------------------------------------------------
def preprocess(img_path: Path) -> np.ndarray:
    img = PILImage.open(img_path).convert("RGB")
    img = img.resize((MOBILENET_INPUT, MOBILENET_INPUT), PILImage.LANCZOS)
    arr = np.array(img, dtype=np.float32) / 255.0          # (224, 224, 3)
    arr = (arr - IMAGENET_MEAN) / IMAGENET_STD              # normalización ImageNet
    arr = arr.transpose(2, 0, 1)[np.newaxis]                # (1, 3, 224, 224)
    return arr


# ---------------------------------------------------------------------------
# Modelo combinado: MobileNetV2 + PCA proyectada + L2 norm
# ---------------------------------------------------------------------------
class EmbeddingModel(nn.Module):
    """
    Salida: vector L2-normalizado de N_COMPONENTS dims.
    La capa PCA se inicializa con los pesos de sklearn después del ajuste.
    """
    def __init__(self, n_components: int):
        super().__init__()
        base = mobilenet_v2(weights=MobileNet_V2_Weights.IMAGENET1K_V1)
        self.features = base.features
        self.avgpool = nn.AdaptiveAvgPool2d((1, 1))
        # Proyección PCA: (x - mean) @ components.T  implementado como Linear
        self.pca = nn.Linear(1280, n_components, bias=True)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.features(x)
        x = self.avgpool(x)
        x = x.flatten(1)          # (batch, 1280)
        x = self.pca(x)            # (batch, n_components)
        x = F.normalize(x, p=2, dim=1)   # L2 unitario → cosine via dot product
        return x

    def set_pca_weights(self, pca: PCA) -> None:
        """Inicializa la Linear con la transformación PCA de sklearn."""
        W = torch.tensor(pca.components_.T, dtype=torch.float32)  # (1280, n)
        b = torch.tensor(-(pca.mean_ @ pca.components_.T), dtype=torch.float32)  # (n,)
        with torch.no_grad():
            self.pca.weight.copy_(W.T)   # nn.Linear guarda W transpuesta
            self.pca.bias.copy_(b)


# ---------------------------------------------------------------------------
# Extraer embeddings base (1280-dim) con ONNX Runtime
# ---------------------------------------------------------------------------
def extract_base_embeddings(index: dict, ort_session) -> tuple[list[str], np.ndarray]:
    """
    Devuelve (keys, matrix) donde matrix tiene shape (N, 1280).
    keys: lista de variantKey (code + suffix).
    """
    keys = []
    vecs = []
    n_total = sum(len(e["variants"]) for e in index.values())
    done = 0
    skipped = 0
    t0 = time.time()

    for code, entry in index.items():
        for v in entry.get("variants", []):
            rel = v.get("image_local", "")
            img_path = ROOT / rel if rel else None
            if not img_path or not img_path.exists():
                skipped += 1
                continue
            try:
                arr = preprocess(img_path)
                out = ort_session.run(None, {"input": arr})[0]  # (1, 1280)
                keys.append(f"{code}{v['suffix']}")
                vecs.append(out[0])
            except Exception as e:
                skipped += 1
                print(f"\n    [!] {code}{v['suffix']}: {e}")
            done += 1
            if done % 50 == 0 or done == n_total:
                elapsed = time.time() - t0
                rate = done / elapsed if elapsed > 0 else 0
                print(f"  {done}/{n_total}  ({rate:.0f}/s)  saltadas: {skipped}", end="\r")

    print()
    return keys, np.array(vecs, dtype=np.float32)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--components", type=int, default=N_COMPONENTS_DEFAULT,
                        help=f"Dimensiones PCA (default {N_COMPONENTS_DEFAULT})")
    parser.add_argument("--no-quant", action="store_true",
                        help="No aplicar cuantización dinámica al modelo ONNX")
    args = parser.parse_args()

    print("=" * 60)
    print(" Constructor de embeddings · MobileNetV2 + PCA")
    print("=" * 60)

    # ── Cargar índice ────────────────────────────────────────────────────────
    if not INDEX_PATH.exists():
        print(f"[!] No existe {INDEX_PATH}. Ejecuta primero build_card_database.py")
        sys.exit(1)
    with open(INDEX_PATH, encoding="utf-8") as f:
        index = json.load(f).get("cards", {})
    total_variants = sum(len(e["variants"]) for e in index.values())
    print(f"[*] {len(index)} cartas · {total_variants} variantes")

    # ── Paso 1: exportar backbone base a ONNX temporal ──────────────────────
    print("\n[1/4] Exportando backbone MobileNetV2 a ONNX...")
    base = mobilenet_v2(weights=MobileNet_V2_Weights.IMAGENET1K_V1)
    backbone = nn.Sequential(base.features, nn.AdaptiveAvgPool2d((1, 1)), nn.Flatten())
    backbone.eval()

    tmp_onnx = DATA_DIR / "model_backbone_tmp.onnx"
    dummy = torch.zeros(1, 3, MOBILENET_INPUT, MOBILENET_INPUT)
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with torch.no_grad():
        torch.onnx.export(
            backbone, dummy, str(tmp_onnx),
            input_names=["input"], output_names=["features"],
            dynamic_axes={"input": {0: "batch"}, "features": {0: "batch"}},
            opset_version=18,
            dynamo=False,  # usar tracing clásico, más estable en Windows
        )
    print(f"    backbone temporal: {tmp_onnx.stat().st_size // 1024} KB")

    # ── Paso 2: extraer embeddings de todas las imágenes ────────────────────
    print(f"\n[2/4] Extrayendo embeddings de {total_variants} variantes...")
    ort_session = ort.InferenceSession(str(tmp_onnx), providers=["CPUExecutionProvider"])
    keys, base_embs = extract_base_embeddings(index, ort_session)
    print(f"    {len(keys)} embeddings de 1280 dims extraídos")

    # ── Paso 3: PCA + L2 normalize ───────────────────────────────────────────
    n_comp = min(args.components, len(keys), base_embs.shape[1])
    print(f"\n[3/5] Ajustando PCA {base_embs.shape[1]} → {n_comp} dims...")
    pca = PCA(n_components=n_comp, random_state=42)
    pca.fit(base_embs)
    var_explained = pca.explained_variance_ratio_.sum()
    print(f"    Varianza explicada: {var_explained:.1%}")

    # ── Paso 4: exportar modelo combinado (backbone + PCA + L2) ─────────────
    print(f"\n[4/5] Exportando modelo combinado a ONNX...")
    model = EmbeddingModel(n_components=n_comp)
    model.set_pca_weights(pca)
    model.eval()

    with torch.no_grad():
        torch.onnx.export(
            model, dummy, str(MODEL_ONNX_PATH),
            input_names=["input"], output_names=["embedding"],
            dynamic_axes={"input": {0: "batch"}, "embedding": {0: "batch"}},
            opset_version=18,
            dynamo=False,
        )
    raw_kb = MODEL_ONNX_PATH.stat().st_size // 1024
    print(f"    Modelo float32: {raw_kb} KB")

    # Cuantización dinámica (weights → uint8, activaciones en float32)
    if not args.no_quant:
        try:
            from onnxruntime.quantization import quantize_dynamic, QuantType
            quant_path = DATA_DIR / "model_quant.onnx"
            quantize_dynamic(str(MODEL_ONNX_PATH), str(quant_path),
                             weight_type=QuantType.QUInt8)
            MODEL_ONNX_PATH.unlink()
            quant_path.rename(MODEL_ONNX_PATH)
            quant_kb = MODEL_ONNX_PATH.stat().st_size // 1024
            print(f"    Modelo cuantizado (uint8): {quant_kb} KB  ({raw_kb - quant_kb} KB ahorrados)")
        except Exception as e:
            print(f"    [!] Cuantizacion fallida ({e}), usando float32")

    # Limpiar backbone temporal
    tmp_onnx.unlink(missing_ok=True)

    # ── Paso 5: re-extraer embeddings finales con el modelo ONNX final ───────
    # Esencial: los embeddings de la base de datos deben salir del MISMO modelo
    # (incluyendo la cuantizacion) que usara la app en runtime.
    print(f"\n[5/5] Re-extrayendo embeddings finales con el modelo ONNX cuantizado...")
    final_sess = ort.InferenceSession(str(MODEL_ONNX_PATH), providers=["CPUExecutionProvider"])
    final_keys, final_vecs_list = [], []
    done = 0
    skipped = 0
    t0 = time.time()

    for code, entry in index.items():
        for v in entry.get("variants", []):
            rel = v.get("image_local", "")
            img_path = ROOT / rel if rel else None
            if not img_path or not img_path.exists():
                skipped += 1
                continue
            try:
                arr = preprocess(img_path)
                emb = final_sess.run(None, {"input": arr})[0][0]  # (n_comp,)
                final_keys.append(f"{code}{v['suffix']}")
                final_vecs_list.append(emb)
            except Exception as e:
                skipped += 1
            done += 1
            if done % 100 == 0 or done == total_variants:
                elapsed = time.time() - t0
                rate = done / elapsed if elapsed > 0 else 0
                print(f"  {done}/{total_variants}  ({rate:.0f}/s)", end="\r")

    print()
    final_vecs = np.array(final_vecs_list, dtype=np.float32)  # (N, n_comp)

    # Serializar en formato compacto: keys array + base64 de los float32
    # Tamano: N * n_comp * 4 bytes = 4571 * 64 * 4 = ~1.1 MB (vs 6 MB de JSON)
    import base64
    flat_bytes = final_vecs.astype(np.float32).tobytes()
    b64_data = base64.b64encode(flat_bytes).decode("ascii")
    payload = {
        "n_components": n_comp,
        "count": len(final_keys),
        "keys": final_keys,
        "data": b64_data,       # float32 binario, row-major (N * n_comp valores)
    }
    with open(EMBEDDINGS_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f)
    emb_kb = EMBEDDINGS_PATH.stat().st_size // 1024
    print(f"    {len(final_keys)} embeddings guardados: {EMBEDDINGS_PATH.name}  ({emb_kb} KB)")

    # ── Copiar a la app ──────────────────────────────────────────────────────
    import shutil
    APP_ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    shutil.copy2(MODEL_ONNX_PATH, APP_ASSETS_DIR / "model.onnx")
    shutil.copy2(EMBEDDINGS_PATH, APP_DATA_DIR / "embeddings.json")
    print(f"\n[OK] Copiado a app/assets/model.onnx + app/src/data/embeddings.json")

    # ── Verificacion rapida de consistencia ──────────────────────────────────
    print("\n[*] Verificando consistencia (self-similarity de 5 cartas)...")
    # Reconstruir dict para verificacion
    vdb = {k: v for k, v in zip(final_keys, final_vecs_list)}
    sample_keys = final_keys[:5]
    sims = []
    for sk in sample_keys:
        img_entry = None
        for entry in index.values():
            for v in entry.get("variants", []):
                if f"{entry['code']}{v['suffix']}" == sk:
                    rel = v.get("image_local", "")
                    if rel:
                        img_entry = ROOT / rel
                    break
            if img_entry:
                break
        if img_entry and img_entry.exists():
            arr = preprocess(img_entry)
            live_emb = final_sess.run(None, {"input": arr})[0][0]
            stored = np.array(vdb[sk])
            sim = float(np.dot(live_emb, stored))
            sims.append(sim)
            print(f"    {sk}: {sim:.4f}")

    if sims:
        mean_sim = np.mean(sims)
        print(f"    Media: {mean_sim:.4f}  ({'OK' if mean_sim > 0.999 else 'hay deriva de cuantizacion'})")

    print("\n[DONE]")
    print(f"  Modelo ONNX:  {MODEL_ONNX_PATH.stat().st_size // 1024} KB")
    print(f"  Embeddings:   {emb_kb} KB  ({len(final_keys)} variantes, {n_comp} dims)")


if __name__ == "__main__":
    main()

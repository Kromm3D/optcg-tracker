#!/usr/bin/env python3
"""
train_embeddings.py
-------------------
Entrena (fine-tune) un modelo de embeddings de arte ESPECÍFICO para cartas, en vez
de usar características genéricas de ImageNet + PCA (lo que hace build_embeddings.py).

Por qué: el escáner falla con fotos reales (ángulo, brillo, glare, recorte impreciso)
porque MobileNetV2+PCA sin fine-tuning NO es invariante a esas condiciones. La foto
de cámara cae lejos del vector de la imagen limpia de referencia. La solución — la
misma que usan ManaBox / MultiTCG / Ximilar — es aprendizaje métrico (metric learning)
con AUMENTACIÓN SINTÉTICA: tratamos cada carta como una clase y enseñamos a la red a
mapear vistas aumentadas (perspectiva, glare, blur, ruido, JPEG, recorte de borde,
oclusión) de la MISMA carta a un cúmulo apretado, separado del resto.

No hace falta fotos reales etiquetadas: las referencias aumentadas enseñan la
invariancia. Salida = mismo contrato que build_embeddings.py:
  - data/model.onnx        (entrada CHW normalizada ImageNet → embedding L2, 'embedding')
  - data/embeddings.json   ({n_components, count, keys, data=base64 float32})
ambos copiados a app/ — DROP-IN para onnx.ts / embeddings.ts (sin cambios en la app).

USO:
    pip install torch torchvision onnxruntime pillow numpy
    python scripts/train_embeddings.py                       # ArcFace, 25 épocas
    python scripts/train_embeddings.py --loss supcon         # contrastivo supervisado
    python scripts/train_embeddings.py --epochs 40 --emb-dim 128
    python scripts/train_embeddings.py --limit 200 --epochs 2 # smoke test rápido

NOTA: en CPU es lento (recomendado GPU). Usa --limit para una prueba de humo.
"""

import argparse
import base64
import json
import sys
import time
from pathlib import Path

# La consola de Windows (cp1252) no puede imprimir flechas unicode; forzar UTF-8.
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

import numpy as np
from PIL import Image as PILImage

try:
    import torch
    import torch.nn as nn
    import torch.nn.functional as F
    from torch.utils.data import Dataset, DataLoader
    from torchvision.models import mobilenet_v3_small, MobileNet_V3_Small_Weights
    from torchvision.transforms import v2
except ImportError:
    print("[!] Falta torch/torchvision. Instala:")
    print("    pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu")
    sys.exit(1)

try:
    import onnxruntime as ort
except ImportError:
    print("[!] Falta onnxruntime. Instala:  pip install onnxruntime")
    sys.exit(1)

# ---------------------------------------------------------------------------
# Configuración / rutas (idénticas a build_embeddings.py)
# ---------------------------------------------------------------------------
ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
INDEX_PATH = DATA_DIR / "index.json"
MODEL_ONNX_PATH = DATA_DIR / "model.onnx"
EMBEDDINGS_PATH = DATA_DIR / "embeddings.json"
APP_ASSETS_DIR = ROOT / "app" / "assets"
APP_DATA_DIR = ROOT / "app" / "src" / "data"

INPUT_SIZE = 224
# Normalización ImageNet — la app (onnx.ts) la aplica en JS antes de inferir, así
# que el modelo exportado espera la entrada YA normalizada (sin capa de norm dentro).
IMAGENET_MEAN = [0.485, 0.456, 0.406]
IMAGENET_STD = [0.229, 0.224, 0.225]
# Aspect ~5:7 de una carta OPTCG (para los recortes aumentados).
CARD_RATIO = (0.62, 0.80)


# ---------------------------------------------------------------------------
# Dataset: una imagen de referencia por variante, etiquetada por clase.
# ---------------------------------------------------------------------------
class CardDataset(Dataset):
    def __init__(self, samples, transform, views=1):
        # samples: list[(img_path:str, class_idx:int)]
        self.samples = samples
        self.transform = transform
        self.views = views  # 1 para ArcFace, 2 para SupCon

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, i):
        path, label = self.samples[i]
        img = PILImage.open(path).convert("RGB")
        if self.views == 1:
            return self.transform(img), label
        # Dos vistas aumentadas independientes (par positivo para contrastivo).
        return torch.stack([self.transform(img), self.transform(img)]), label


def build_transforms():
    """Aumentación que simula la captura real + error de segmentación del recorte."""
    train = v2.Compose([
        v2.PILToTensor(),                                   # uint8 CHW
        v2.RandomPerspective(distortion_scale=0.35, p=0.7), # ángulo de cámara
        v2.RandomRotation(degrees=8),
        # scale<1 = demasiado borde; ratio = recorte tipo carta → robustez a segmentación
        v2.RandomResizedCrop(INPUT_SIZE, scale=(0.72, 1.0), ratio=CARD_RATIO, antialias=True),
        v2.ColorJitter(brightness=0.45, contrast=0.35, saturation=0.35, hue=0.05),  # glare / WB
        v2.RandomApply([v2.GaussianBlur(kernel_size=3, sigma=(0.1, 2.0))], p=0.4),
        v2.RandomApply([v2.JPEG(quality=(40, 90))], p=0.4),  # artefactos de compresión
        v2.ToDtype(torch.float32, scale=True),               # → [0,1]
        v2.RandomApply([v2.GaussianNoise(sigma=0.03)], p=0.3),
        v2.Normalize(mean=IMAGENET_MEAN, std=IMAGENET_STD),
        v2.RandomErasing(p=0.25, scale=(0.02, 0.08), value="random"),  # oclusión / reflejo
    ])
    # Limpio: referencia tal cual (igual que build_embeddings.preprocess).
    clean = v2.Compose([
        v2.PILToTensor(),
        v2.Resize((INPUT_SIZE, INPUT_SIZE), antialias=True),
        v2.ToDtype(torch.float32, scale=True),
        v2.Normalize(mean=IMAGENET_MEAN, std=IMAGENET_STD),
    ])
    return train, clean


# ---------------------------------------------------------------------------
# Modelo: backbone MobileNetV3-small + cabeza de embedding (L2-normalizado).
# Es lo que se exporta a ONNX. La cabeza ArcFace queda FUERA (solo para entrenar).
# ---------------------------------------------------------------------------
class EmbeddingNet(nn.Module):
    def __init__(self, emb_dim: int):
        super().__init__()
        base = mobilenet_v3_small(weights=MobileNet_V3_Small_Weights.IMAGENET1K_V1)
        self.features = base.features          # → (B, 576, 7, 7)
        self.pool = nn.AdaptiveAvgPool2d(1)
        self.head = nn.Linear(576, emb_dim)

    def forward(self, x):
        x = self.features(x)
        x = self.pool(x).flatten(1)            # (B, 576)
        x = self.head(x)                       # (B, emb_dim)
        return F.normalize(x, p=2, dim=1)      # unitario → coseno = producto punto


class ArcMarginProduct(nn.Module):
    """Cabeza ArcFace: margen angular aditivo sobre embeddings normalizados."""
    def __init__(self, in_features, out_features, s=30.0, m=0.50):
        super().__init__()
        self.s, self.m = s, m
        self.weight = nn.Parameter(torch.empty(out_features, in_features))
        nn.init.xavier_uniform_(self.weight)

    def forward(self, emb, labels):
        cosine = F.linear(emb, F.normalize(self.weight, dim=1)).clamp(-1 + 1e-7, 1 - 1e-7)
        theta = torch.acos(cosine)
        target = torch.cos(theta + self.m)
        onehot = F.one_hot(labels, num_classes=self.weight.size(0)).float()
        logits = onehot * target + (1 - onehot) * cosine
        return logits * self.s


def sup_con_loss(emb, labels, temperature=0.1):
    """SupCon (Khosla et al.): vistas de la misma clase = positivos."""
    device = emb.device
    sim = emb @ emb.t() / temperature
    sim = sim - sim.max(dim=1, keepdim=True).values.detach()
    exp = torch.exp(sim)
    eye = torch.eye(len(emb), device=device, dtype=torch.bool)
    exp = exp.masked_fill(eye, 0)
    pos_mask = (labels.unsqueeze(0) == labels.unsqueeze(1)) & ~eye
    log_prob = sim - torch.log(exp.sum(dim=1, keepdim=True) + 1e-12)
    pos_count = pos_mask.sum(dim=1)
    valid = pos_count > 0
    mean_log_prob = (pos_mask * log_prob).sum(dim=1)[valid] / pos_count[valid]
    return -mean_log_prob.mean()


# ---------------------------------------------------------------------------
# Carga de muestras desde el índice.
# ---------------------------------------------------------------------------
def load_samples(limit=None):
    with open(INDEX_PATH, encoding="utf-8") as f:
        index = json.load(f).get("cards", {})
    samples, keys = [], []
    for code, entry in index.items():
        for v in entry.get("variants", []):
            rel = v.get("image_local", "")
            if not rel:
                continue
            p = ROOT / rel
            if not p.exists():
                continue
            samples.append((str(p), len(keys)))
            keys.append(f"{code}{v['suffix']}")
            if limit and len(keys) >= limit:
                return samples, keys
    return samples, keys


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--loss", choices=["arcface", "supcon"], default="arcface")
    ap.add_argument("--epochs", type=int, default=25)
    ap.add_argument("--batch", type=int, default=64)
    ap.add_argument("--emb-dim", type=int, default=128)
    ap.add_argument("--lr", type=float, default=3e-4)
    ap.add_argument("--workers", type=int, default=0)  # 0 = seguro en Windows
    ap.add_argument("--device", default="cuda" if torch.cuda.is_available() else "cpu")
    ap.add_argument("--no-quant", action="store_true")
    ap.add_argument("--limit", type=int, default=None, help="Subconjunto para prueba de humo")
    args = ap.parse_args()

    print("=" * 64)
    print(f" Entrenamiento de embeddings · MobileNetV3-small · loss={args.loss}")
    print("=" * 64)
    if args.device == "cpu":
        print("[!] Sin CUDA — el entrenamiento será LENTO. Usa --limit para probar.")

    if not INDEX_PATH.exists():
        print(f"[!] No existe {INDEX_PATH}. Ejecuta antes build_card_database.py")
        sys.exit(1)

    samples, keys = load_samples(args.limit)
    n_classes = len(keys)
    print(f"[*] {n_classes} cartas (clases) con imagen local")

    train_tf, clean_tf = build_transforms()
    views = 2 if args.loss == "supcon" else 1
    ds = CardDataset(samples, train_tf, views=views)
    dl = DataLoader(ds, batch_size=args.batch, shuffle=True,
                    num_workers=args.workers, drop_last=True, pin_memory=False)

    device = torch.device(args.device)
    model = EmbeddingNet(args.emb_dim).to(device)
    arc = ArcMarginProduct(args.emb_dim, n_classes).to(device) if args.loss == "arcface" else None
    params = list(model.parameters()) + (list(arc.parameters()) if arc else [])
    opt = torch.optim.AdamW(params, lr=args.lr, weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=args.epochs)
    ce = nn.CrossEntropyLoss()

    # ── Bucle de entrenamiento ───────────────────────────────────────────────
    print(f"\n[1/3] Entrenando {args.epochs} épocas (batch {args.batch})...")
    model.train()
    for epoch in range(args.epochs):
        t0, running, nb = time.time(), 0.0, 0
        for batch in dl:
            if views == 2:
                x, labels = batch                       # x: (B, 2, C, H, W)
                B = x.size(0)
                x = x.view(B * 2, *x.shape[2:]).to(device)
                labels = labels.repeat_interleave(2).to(device)
                emb = model(x)
                loss = sup_con_loss(emb, labels)
            else:
                x, labels = batch
                x, labels = x.to(device), labels.to(device)
                emb = model(x)
                loss = ce(arc(emb, labels), labels)
            opt.zero_grad()
            loss.backward()
            opt.step()
            running += loss.item(); nb += 1
        sched.step()
        dt = time.time() - t0
        print(f"  época {epoch+1:>3}/{args.epochs}  loss={running/max(nb,1):.4f}  ({dt:.0f}s)")

    # ── Exportar ONNX (solo el EmbeddingNet) ─────────────────────────────────
    print(f"\n[2/3] Exportando ONNX → {MODEL_ONNX_PATH.name}")
    model.eval()
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    dummy = torch.zeros(1, 3, INPUT_SIZE, INPUT_SIZE, device=device)
    with torch.no_grad():
        torch.onnx.export(
            model, dummy, str(MODEL_ONNX_PATH),
            input_names=["input"], output_names=["embedding"],
            dynamic_axes={"input": {0: "batch"}, "embedding": {0: "batch"}},
            opset_version=18, dynamo=False,
        )
    raw_kb = MODEL_ONNX_PATH.stat().st_size // 1024
    print(f"    modelo float32: {raw_kb} KB")

    if not args.no_quant:
        try:
            from onnxruntime.quantization import quantize_dynamic, QuantType
            qpath = DATA_DIR / "model_quant.onnx"
            quantize_dynamic(str(MODEL_ONNX_PATH), str(qpath), weight_type=QuantType.QUInt8)
            MODEL_ONNX_PATH.unlink(); qpath.rename(MODEL_ONNX_PATH)
            print(f"    cuantizado uint8: {MODEL_ONNX_PATH.stat().st_size // 1024} KB")
        except Exception as e:
            print(f"    [!] cuantización fallida ({e}); usando float32")

    # ── Regenerar embeddings.json con el modelo ONNX FINAL (refs limpias) ─────
    # Crítico: la base de datos debe salir del mismo modelo (incl. cuantización)
    # que usará la app en runtime.
    print(f"\n[3/3] Re-extrayendo embeddings de referencia con el ONNX final...")
    sess = ort.InferenceSession(str(MODEL_ONNX_PATH), providers=["CPUExecutionProvider"])
    vecs, out_keys = [], []
    t0 = time.time()
    for i, (path, _) in enumerate(samples):
        img = PILImage.open(path).convert("RGB")
        arr = clean_tf(img).unsqueeze(0).numpy().astype(np.float32)
        emb = sess.run(None, {"input": arr})[0][0]
        vecs.append(emb); out_keys.append(keys[i])
        if (i + 1) % 200 == 0 or i + 1 == len(samples):
            print(f"  {i+1}/{len(samples)} ({(i+1)/max(time.time()-t0,1e-9):.0f}/s)", end="\r")
    print()
    mat = np.array(vecs, dtype=np.float32)

    payload = {
        "n_components": int(mat.shape[1]),
        "count": len(out_keys),
        "keys": out_keys,
        "data": base64.b64encode(mat.tobytes()).decode("ascii"),
    }
    with open(EMBEDDINGS_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f)
    emb_kb = EMBEDDINGS_PATH.stat().st_size // 1024
    print(f"    {len(out_keys)} embeddings guardados ({emb_kb} KB, {mat.shape[1]} dims)")

    # ── Copiar a la app ──────────────────────────────────────────────────────
    import shutil
    APP_ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    APP_DATA_DIR.mkdir(parents=True, exist_ok=True)
    shutil.copy2(MODEL_ONNX_PATH, APP_ASSETS_DIR / "model.onnx")
    shutil.copy2(EMBEDDINGS_PATH, APP_DATA_DIR / "embeddings.json")
    print(f"[OK] Copiado a app/assets/model.onnx + app/src/data/embeddings.json")

    # ── Verificación: separación intra vs inter-clase ────────────────────────
    # Embedding de una vista AUMENTADA vs su referencia limpia (debe ser alto) y
    # vs otra carta (debe ser bajo). Mide si el fine-tuning logró invariancia.
    print("\n[*] Verificación (5 cartas: sim aumentada↔referencia vs ↔otra)...")
    rng = np.random.default_rng(0)
    idxs = rng.choice(len(samples), size=min(5, len(samples)), replace=False)
    for i in idxs:
        img = PILImage.open(samples[i][0]).convert("RGB")
        aug = train_tf(img).unsqueeze(0).numpy().astype(np.float32)
        aug_emb = sess.run(None, {"input": aug})[0][0]
        same = float(np.dot(aug_emb, mat[i]))
        j = (i + 1) % len(samples)
        other = float(np.dot(aug_emb, mat[j]))
        print(f"    {out_keys[i]}: propia={same:.3f}  otra={other:.3f}  "
              f"{'OK' if same - other > 0.2 else 'débil'}")

    print("\n[DONE]")
    print(f"  Modelo:     {MODEL_ONNX_PATH.stat().st_size // 1024} KB")
    print(f"  Embeddings: {emb_kb} KB ({len(out_keys)} cartas, {mat.shape[1]} dims)")
    print("  Recuerda: prueba en un dev build y ajusta MATCH_THRESHOLD en embeddings.ts.")


if __name__ == "__main__":
    main()

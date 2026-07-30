#!/usr/bin/env python3
"""Issue #149 — Arm B (PARSeq-small) inference over frozen Brand crop pixels.

Reads opaque-named PNGs, applies the preregistered intrinsic transform, and emits
sequence-only raw evidence. Runs offline. Reads no truth and no case mapping: the
only inputs are opaque filenames and the mounted checkpoint.

Never fabricates bounding boxes, word or character geometry, Tesseract-style
confidence, abstention, or Label Lens authority state.
"""

import hashlib
import io
import json
import os
import resource
import sys
import time

CHECKPOINT = "/model/pytorch_model.bin"
INPUT_DIR = "/inputs"
OUT_DIR = "/out"

EXPECTED_SHA256 = "bb5792a68e367476abca029cbf8699abc805f3d3dc7e57aae45c8ec4f7b7cd00"
EXPECTED_BYTES = 95392675


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: str) -> str:
    with open(path, "rb") as handle:
        return sha256_bytes(handle.read())


def main() -> int:
    os.makedirs(OUT_DIR, exist_ok=True)
    run_id = sys.argv[1] if len(sys.argv) > 1 else "primary"

    if os.path.getsize(CHECKPOINT) != EXPECTED_BYTES or sha256_file(CHECKPOINT) != EXPECTED_SHA256:
        print(json.dumps({"status": "FAILED", "reason": "CHECKPOINT_INTEGRITY_MISMATCH"}))
        return 1

    import numpy as np
    import torch
    from PIL import Image

    torch.manual_seed(0)
    np.random.seed(0)
    torch.use_deterministic_algorithms(True)
    torch.set_num_threads(1)

    load_start = time.perf_counter()
    state = torch.load(CHECKPOINT, map_location="cpu", weights_only=True)
    if not isinstance(state, dict) or any(not isinstance(v, torch.Tensor) for v in state.values()):
        print(json.dumps({"status": "FAILED", "reason": "STATE_DICT_NOT_TENSOR_ONLY"}))
        return 1

    sys.path.insert(0, "/opt/parseq")
    from strhub.data.module import SceneTextDataModule
    from strhub.models.utils import create_model

    model = create_model("parseq", pretrained=False)
    model.model.load_state_dict(state, strict=True)
    model = model.eval()
    model_load_ms = (time.perf_counter() - load_start) * 1000.0

    hp = model.hparams
    transform = SceneTextDataModule.get_transform(hp.img_size)
    tokenizer = model.tokenizer

    records = []
    for name in sorted(f for f in os.listdir(INPUT_DIR) if f.endswith(".png")):
        opaque = name[:-4]
        with open(os.path.join(INPUT_DIR, name), "rb") as handle:
            source_bytes = handle.read()
        image = Image.open(io.BytesIO(source_bytes)).convert("RGB")
        source_width, source_height = image.size
        tensor = transform(image).unsqueeze(0)

        started = time.perf_counter()
        errors = []
        try:
            with torch.inference_mode():
                logits = model(tensor)
        except Exception as error:  # noqa: BLE001
            errors.append(f"{type(error).__name__}: {error}")
            logits = None
        latency_ms = (time.perf_counter() - started) * 1000.0

        if logits is None:
            with open(os.path.join(OUT_DIR, f"B-{opaque}-{run_id}.ABSENT-OUTPUT.md"), "w") as handle:
                handle.write(f"# Absent output - B/{opaque}/{run_id}\n\nInference raised; no logits. Nothing fabricated.\n\n{errors}\n")
            records.append({"opaqueItemId": opaque, "arm": "B", "run": run_id, "executed": False, "errors": errors})
            continue

        logits_np = logits.detach().cpu().numpy()
        logits_path = os.path.join(OUT_DIR, f"B-{opaque}-{run_id}.logits.npy")
        np.save(logits_path, logits_np, allow_pickle=False)

        probs = logits.softmax(-1)
        token_ids = probs.argmax(-1)[0].tolist()
        eos_id = tokenizer.eos_id
        eos_index = token_ids.index(eos_id) if eos_id in token_ids else None
        cut = eos_index if eos_index is not None else len(token_ids)
        per_char = probs[0].max(-1).values[:cut].tolist()
        span = probs[0].max(-1).values[: (cut + 1 if eos_index is not None else cut)]
        native_score = float(span.prod().item()) if span.numel() else None
        decoded, _ = tokenizer.decode(probs)
        raw_transcript = decoded[0]
        tokens = [tokenizer._itos[i] if i < len(tokenizer._itos) else f"<{i}>" for i in token_ids[:cut]]

        record = {
            "opaqueItemId": opaque,
            "arm": "B",
            "run": run_id,
            "sourcePngSha256": sha256_bytes(source_bytes),
            "sourceWidth": source_width,
            "sourceHeight": source_height,
            "transformedTensorShape": list(tensor.shape),
            "transformedTensorDtype": str(tensor.dtype),
            "transformedTensorSha256": sha256_bytes(tensor.numpy().tobytes()),
            "rawLogitsArtifact": os.path.basename(logits_path),
            "logitsShape": list(logits_np.shape),
            "logitsSha256": sha256_file(logits_path),
            "logitsAllFinite": bool(np.isfinite(logits_np).all()),
            "rawTokenIds": token_ids[:cut],
            "rawTokens": tokens,
            "eosIndex": eos_index,
            "rawTranscript": raw_transcript,
            "characterProbabilities": per_char,
            "nativeSequenceScore": native_score,
            "emptyTranscript": len(raw_transcript) == 0,
            "latencyMs": latency_ms,
            "modelLoadMs": model_load_ms,
            "modelLoadIncludedInLatency": False,
            "peakMemoryBytes": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss * 1024,
            "warnings": [],
            "errors": errors,
            "executed": True,
            "fabricatedGeometry": False,
            "ocrWordObjectsCreated": False,
        }
        record["outputFingerprint"] = sha256_bytes(
            json.dumps(
                {
                    "t": raw_transcript,
                    "ids": record["rawTokenIds"],
                    "eos": eos_index,
                    "probs": [round(p, 12) for p in per_char],
                    "logits": record["logitsSha256"],
                },
                sort_keys=True,
            ).encode()
        )
        with open(os.path.join(OUT_DIR, f"B-{opaque}-{run_id}.descriptor.json"), "w") as handle:
            json.dump(record, handle, indent=2)
        records.append(record)

    with open(os.path.join(OUT_DIR, f"arm-b-{run_id}.json"), "w") as handle:
        json.dump(
            {
                "arm": "B",
                "run": run_id,
                "engine": "parseq-small",
                "codeCommit": "1902db043c029a7e03a3818c616c06600af574be",
                "modelCommit": "a1526c3d63740e460153987f9aaf6b86aa199dc1",
                "checkpointSha256": EXPECTED_SHA256,
                "decodeAr": bool(hp.decode_ar),
                "refineIters": int(hp.refine_iters),
                "decodingMode": "greedy-argmax",
                "batchSize": 1,
                "architecture": {
                    "imgSizeHeightWidth": list(hp.img_size),
                    "patchSizeHeightWidth": list(hp.patch_size),
                    "embedDim": hp.embed_dim,
                    "charsetTrainLength": len(hp.charset_train),
                },
                "truthRead": False,
                "records": records,
            },
            handle,
            indent=2,
        )
    print(json.dumps({"status": "OK", "run": run_id, "items": len(records)}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

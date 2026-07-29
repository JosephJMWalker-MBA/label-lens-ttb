#!/usr/bin/env python3
"""Issue #149 — PARSeq-small compatibility and sequence-evidence probe.

Loads the explicitly licensed Hugging Face state dictionary through the official
PARSeq loading semantics, then runs the fixed four-invocation matrix and emits
sequence-only raw evidence.

Sequence-only by construction: no bounding boxes, no word/line/character
geometry, no Tesseract-style confidence, no Label Lens authority. Probabilities
stay in their native 0-1 range.

Runs offline. Reads no corpus and no fixture truth.
"""

import hashlib
import io
import json
import os
import resource
import sys
import time
import warnings

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


def peak_memory_bytes() -> int:
    # ru_maxrss is kilobytes on Linux.
    return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss * 1024


def main() -> int:
    os.makedirs(OUT_DIR, exist_ok=True)
    captured = []
    warnings.simplefilter("always")

    # --- integrity gate on the mounted checkpoint -------------------------
    actual_bytes = os.path.getsize(CHECKPOINT)
    actual_sha = sha256_file(CHECKPOINT)
    if actual_bytes != EXPECTED_BYTES or actual_sha != EXPECTED_SHA256:
        json.dump(
            {
                "status": "FAILED",
                "reason": "CHECKPOINT_INTEGRITY_MISMATCH",
                "expected": {"sha256": EXPECTED_SHA256, "bytes": EXPECTED_BYTES},
                "actual": {"sha256": actual_sha, "bytes": actual_bytes},
            },
            open(os.path.join(OUT_DIR, "safe-loading-report.json"), "w"),
            indent=2,
        )
        return 1

    import numpy as np
    import torch
    from PIL import Image

    # Determinism settings, fixed before any model construction.
    torch.manual_seed(0)
    np.random.seed(0)
    torch.use_deterministic_algorithms(True)
    torch.set_num_threads(1)
    torch.backends.cudnn.benchmark = False

    # --- safe state-dictionary loading -----------------------------------
    load_start = time.perf_counter()
    safe_load_ok = True
    safe_load_error = None
    try:
        state = torch.load(CHECKPOINT, map_location="cpu", weights_only=True)
    except Exception as error:  # noqa: BLE001 - fail closed, record verbatim
        safe_load_ok = False
        safe_load_error = f"{type(error).__name__}: {error}"
        state = None

    if not safe_load_ok:
        json.dump(
            {
                "status": "FAILED",
                "reason": "WEIGHTS_ONLY_LOAD_FAILED",
                "detail": safe_load_error,
                "torchScriptFileUsed": False,
                "arbitraryObjectsExecuted": False,
            },
            open(os.path.join(OUT_DIR, "safe-loading-report.json"), "w"),
            indent=2,
        )
        return 1

    non_tensor = [k for k, v in state.items() if not isinstance(v, torch.Tensor)]
    malformed_keys = [k for k in state if not isinstance(k, str)]
    param_count = int(sum(v.numel() for v in state.values() if isinstance(v, torch.Tensor)))

    # --- official architecture construction ------------------------------
    sys.path.insert(0, "/opt/parseq")
    from strhub.data.module import SceneTextDataModule
    from strhub.models.utils import create_model

    model = create_model("parseq", pretrained=False)
    # Official semantics: for parseq experiments the released state dict targets
    # the inner `model` attribute, exactly as create_model(pretrained=True) does.
    incompatible = model.model.load_state_dict(state, strict=True)
    model = model.eval()
    load_ms = (time.perf_counter() - load_start) * 1000.0

    hp = model.hparams
    safe_report = {
        "artifact": "safe-loading-report",
        "experimentId": "issue-149-parseq-hf-compatibility-probe",
        "checkpointSha256": actual_sha,
        "checkpointBytes": actual_bytes,
        "loadMethod": "torch.load(map_location='cpu', weights_only=True)",
        "weightsOnlyLoadSucceeded": True,
        "torchScriptFileUsed": False,
        "arbitraryObjectsExecuted": False,
        "stateDictIsMapping": isinstance(state, dict),
        "stateDictKeyCount": len(state),
        "nonTensorValues": non_tensor,
        "malformedKeys": malformed_keys,
        "tensorOnly": len(non_tensor) == 0 and len(malformed_keys) == 0,
        "parameterCount": param_count,
        "loadStateDictMissingKeys": list(getattr(incompatible, "missing_keys", [])),
        "loadStateDictUnexpectedKeys": list(getattr(incompatible, "unexpected_keys", [])),
        "strictLoad": True,
        "officialLoadingSemantics": "create_model('parseq', pretrained=False) then model.model.load_state_dict(state, strict=True)",
        "architecture": {
            "imgSizeHeightWidth": list(hp.img_size),
            "patchSizeHeightWidth": list(hp.patch_size),
            "embedDim": hp.embed_dim,
            "maxLabelLength": hp.max_label_length,
            "charsetTrain": hp.charset_train,
            "charsetTrainLength": len(hp.charset_train),
            "charsetTest": hp.charset_test,
            "decodeAr": hp.decode_ar,
            "refineIters": hp.refine_iters,
        },
        "stateDictKeyInventory": sorted(state.keys()),
        "runtime": {
            "python": sys.version.split()[0],
            "torch": torch.__version__,
            "numpy": np.__version__,
            "pillow": __import__("PIL").__version__,
        },
    }
    json.dump(safe_report, open(os.path.join(OUT_DIR, "safe-loading-report.json"), "w"), indent=2)

    if not safe_report["tensorOnly"]:
        return 1

    # --- model-native transform, from the pinned source ------------------
    transform = SceneTextDataModule.get_transform(hp.img_size)
    tokenizer = model.tokenizer

    records = []
    matrix = [("positive", "primary"), ("positive", "repeat"), ("blank", "primary"), ("blank", "repeat")]
    for image_name, run in matrix:
        invocation_id = f"{image_name}-{run}"
        source_path = os.path.join(INPUT_DIR, f"{image_name}.png")
        with open(source_path, "rb") as handle:
            source_bytes = handle.read()
        image = Image.open(io.BytesIO(source_bytes)).convert("RGB")
        source_width, source_height = image.size

        tensor = transform(image).unsqueeze(0)
        tensor_sha = sha256_bytes(tensor.numpy().tobytes())

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
            with open(os.path.join(OUT_DIR, f"{invocation_id}.ABSENT-OUTPUT.md"), "w") as handle:
                handle.write(f"# Absent output - {invocation_id}\n\nInference raised; no logits produced. No output fabricated.\n\n{errors}\n")
            records.append({"invocationId": invocation_id, "image": image_name, "run": run, "errors": errors, "executed": False})
            continue

        logits_np = logits.detach().cpu().numpy()
        logits_path = os.path.join(OUT_DIR, f"{invocation_id}.logits.npy")
        # Canonical unrounded binary artifact.
        np.save(logits_path, logits_np, allow_pickle=False)
        logits_sha = sha256_file(logits_path)
        finite = bool(np.isfinite(logits_np).all())

        probs = logits.softmax(-1)
        token_ids = probs.argmax(-1)[0].tolist()
        eos_id = tokenizer.eos_id
        eos_index = token_ids.index(eos_id) if eos_id in token_ids else None
        cut = eos_index if eos_index is not None else len(token_ids)
        per_char = probs[0].max(-1).values[:cut].tolist()
        # Preregistered native sequence score: product of per-position max softmax
        # probabilities up to and including the first EOS position.
        score_span = probs[0].max(-1).values[: (cut + 1 if eos_index is not None else cut)]
        native_score = float(score_span.prod().item()) if score_span.numel() else None

        decoded, decoded_conf = tokenizer.decode(probs)
        raw_transcript = decoded[0]
        token_strings = [tokenizer._itos[i] if i < len(tokenizer._itos) else f"<{i}>" for i in token_ids[:cut]]

        descriptor = {
            "invocationId": invocation_id,
            "image": image_name,
            "run": run,
            "sourceImageSha256": sha256_bytes(source_bytes),
            "sourceWidth": source_width,
            "sourceHeight": source_height,
            "transformedTensorShape": list(tensor.shape),
            "transformedTensorDtype": str(tensor.dtype),
            "transformedTensorSha256": tensor_sha,
            "rawLogitsArtifact": os.path.basename(logits_path),
            "logitsShape": list(logits_np.shape),
            "logitsSha256": logits_sha,
            "logitsAllFinite": finite,
            "logitsDtype": str(logits_np.dtype),
            "rawTokenIds": token_ids[:cut],
            "rawTokens": token_strings,
            "rawTranscript": raw_transcript,
            "eosIndex": eos_index,
            "characterProbabilities": per_char,
            "nativeSequenceScore": native_score,
            "emptyTranscript": len(raw_transcript) == 0,
            "latencyMs": latency_ms,
            "modelLoadMs": load_ms,
            "modelLoadIncludedInLatency": False,
            "peakMemoryBytes": peak_memory_bytes(),
            "warnings": [str(w.message) for w in captured],
            "errors": errors,
            "executed": True,
        }
        descriptor["outputFingerprint"] = sha256_bytes(
            json.dumps(
                {
                    "t": raw_transcript,
                    "ids": descriptor["rawTokenIds"],
                    "eos": eos_index,
                    "probs": [round(p, 12) for p in per_char],
                    "logits": logits_sha,
                },
                sort_keys=True,
            ).encode()
        )
        json.dump(descriptor, open(os.path.join(OUT_DIR, f"{invocation_id}.descriptor.json"), "w"), indent=2)
        records.append(descriptor)

    json.dump(
        {
            "artifact": "run-results",
            "experimentId": "issue-149-parseq-hf-compatibility-probe",
            "invocations": len(records),
            "plannedInvocations": 4,
            "ocrWordObjectsCreated": False,
            "selectBrandObservationCalled": False,
            "geometryFabricated": False,
            "confidenceRescaled": False,
            "records": records,
        },
        open(os.path.join(OUT_DIR, "run-results.json"), "w"),
        indent=2,
    )
    print(json.dumps({"status": "OK", "invocations": len(records)}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

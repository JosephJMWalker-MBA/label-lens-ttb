#!/usr/bin/env python3
"""Issue #149 — PP-OCRv6-small ONNX compatibility and CTC evidence probe.

Runs exactly the four preregistered invocations (positive-primary,
positive-repeat, blank-primary, blank-repeat) with ONNX Runtime on CPU, and emits
sequence-only raw evidence.

Sequence-only by construction: no bounding boxes, no word/line/character
geometry, no Tesseract-style confidence, no Label Lens authority state. CTC
probabilities stay in their native 0-1 range and are never rescaled.

Preprocessing reproduces the pinned upstream `resize_norm_img` exactly: BGR,
aspect-preserving resize to height 48 with cv2 INTER_LINEAR, zero-padding to
width 320, and (pixel/255 - 0.5) / 0.5.

Runs offline. Reads no corpus and no fixture truth.
"""

import hashlib
import json
import os
import re
import resource
import sys
import time
import unicodedata

MODEL_PATH = "/model/inference.onnx"
CONFIG_PATH = "/config/inference.yml"
AUDIT_PATH = "/audit/dictionary-audit.json"
INPUT_DIR = "/inputs"
OUT_DIR = "/out"

EXPERIMENT_ID = "issue-149-ppocrv6-small-onnx-compatibility-probe"
MODEL_REVISION = "b8f84f0b80c529de40b4fbb3544b84fa7233a513"
EXPECTED_ONNX_SHA256 = "5435fd747c9e0efe15a96d0b378d5bd157e9492ed8fd80edf08f30d02fa24634"
EXPECTED_ONNX_BYTES = 21159378
EXPECTED_CONFIG_SHA256 = "ab078671bb49f06228eadccd34f1bb501e157f7a047095ffb943ba81512c77d1"
EXPECTED_CONFIG_BYTES = 150579

# Frozen preprocessing constants, from PreProcess.RecResizeImg.image_shape.
IMG_C, IMG_H, IMG_W = 3, 48, 320

MATRIX = [("positive", "primary"), ("positive", "repeat"), ("blank", "primary"), ("blank", "repeat")]
NORMALIZED_ALPHABET = set("abcdefghijklmnopqrstuvwxyz0123456789 ")


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: str) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def peak_memory_bytes() -> int:
    # ru_maxrss is kilobytes on Linux.
    return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss * 1024


def fail(reason: str, detail) -> int:
    os.makedirs(OUT_DIR, exist_ok=True)
    record = {"status": "FAILED", "reason": reason, "detail": detail, "outputFabricated": False}
    with open(os.path.join(OUT_DIR, "RUN-FAILED.json"), "w") as handle:
        json.dump(record, handle, indent=2)
        handle.write("\n")
    print(json.dumps(record, indent=2), file=sys.stderr)
    return 1


def normalize_transcript(text: str) -> str:
    """The single preregistered normalization (§11).

    NFKD, strip combining marks, lowercase, replace anything outside [a-z0-9 ]
    with a space, collapse whitespace, trim. The space is preserved at step 4
    regardless of whether the model can emit one, so a whitespace-free comparison
    requires stripping spaces afterwards.
    """
    decomposed = unicodedata.normalize("NFKD", text)
    stripped = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    lowered = stripped.lower()
    filtered = "".join(ch if ch in NORMALIZED_ALPHABET else " " for ch in lowered)
    return re.sub(r"\s+", " ", filtered).strip()


def main() -> int:
    os.makedirs(OUT_DIR, exist_ok=True)

    # ---- integrity gates --------------------------------------------------
    onnx_bytes = os.path.getsize(MODEL_PATH)
    onnx_sha = sha256_file(MODEL_PATH)
    if onnx_bytes != EXPECTED_ONNX_BYTES or onnx_sha != EXPECTED_ONNX_SHA256:
        return fail(
            "ONNX_INTEGRITY_MISMATCH",
            {
                "expected": {"sha256": EXPECTED_ONNX_SHA256, "bytes": EXPECTED_ONNX_BYTES},
                "actual": {"sha256": onnx_sha, "bytes": onnx_bytes},
            },
        )
    config_sha = sha256_file(CONFIG_PATH)
    if os.path.getsize(CONFIG_PATH) != EXPECTED_CONFIG_BYTES or config_sha != EXPECTED_CONFIG_SHA256:
        return fail("CONFIG_INTEGRITY_MISMATCH", {"actual": config_sha})

    import cv2
    import numpy as np
    import onnxruntime as ort
    import yaml

    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from inspect_model import string_only_loader

    # ---- charset, cross-checked against the frozen discovery audit --------
    with open(AUDIT_PATH) as handle:
        audit = json.load(handle)
    with open(CONFIG_PATH, "rb") as handle:
        raw_config = handle.read()
    dictionary = yaml.load(raw_config, Loader=string_only_loader(yaml))["PostProcess"]["character_dict"]
    if len(dictionary) != audit["characterDictLength"]:
        return fail(
            "DICTIONARY_LENGTH_DISAGREES_WITH_AUDIT",
            {"parsed": len(dictionary), "audit": audit["characterDictLength"]},
        )
    if hashlib.sha256("".join(dictionary).encode("utf-8")).hexdigest() != audit["dictSha256"]:
        return fail("DICTIONARY_SHA256_DISAGREES_WITH_AUDIT", {"audit": audit["dictSha256"]})

    vocab_size = audit["vocabSize"]
    blank_id = audit["ctcBlankTokenId"]
    charset = ["<blank>"] + list(dictionary)
    if audit["asciiSpaceAppendedByPostprocessor"]:
        charset.append(" ")
    if len(charset) != vocab_size:
        return fail(
            "CHARSET_LENGTH_DISAGREES_WITH_VOCAB",
            {"charset": len(charset), "vocabSize": vocab_size},
        )

    # ---- session ----------------------------------------------------------
    load_start = time.perf_counter()
    options = ort.SessionOptions()
    options.intra_op_num_threads = 1
    options.inter_op_num_threads = 1
    options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
    session = ort.InferenceSession(
        MODEL_PATH, sess_options=options, providers=["CPUExecutionProvider"]
    )
    load_ms = (time.perf_counter() - load_start) * 1000.0
    input_name = session.get_inputs()[0].name
    output_names = [o.name for o in session.get_outputs()]
    providers_used = list(session.get_providers())

    records = []
    for image_name, run in MATRIX:
        invocation_id = f"{image_name}-{run}"
        source_path = os.path.join(INPUT_DIR, f"{image_name}.png")
        with open(source_path, "rb") as handle:
            source_bytes = handle.read()

        # DecodeImage: img_mode BGR, channel_first false. cv2.imdecode yields BGR
        # HWC directly, so no RGB conversion is applied anywhere in this path.
        buffer = np.frombuffer(source_bytes, dtype=np.uint8)
        image = cv2.imdecode(buffer, cv2.IMREAD_COLOR)
        if image is None:
            return fail("IMAGE_DECODE_FAILED", source_path)
        source_height, source_width = image.shape[0], image.shape[1]

        # resize_norm_img with padding=True, exactly as pinned upstream.
        ratio = source_width / float(source_height)
        resized_w = IMG_W if int(np.ceil(IMG_H * ratio)) > IMG_W else int(np.ceil(IMG_H * ratio))
        resized = cv2.resize(image, (resized_w, IMG_H))
        resized = resized.astype("float32")
        resized = resized.transpose((2, 0, 1)) / 255.0
        resized -= 0.5
        resized /= 0.5
        padded = np.zeros((IMG_C, IMG_H, IMG_W), dtype=np.float32)
        padded[:, :, 0:resized_w] = resized
        tensor = padded[np.newaxis, :, :, :]
        tensor = np.ascontiguousarray(tensor, dtype=np.float32)
        tensor_sha = sha256_bytes(tensor.tobytes())
        valid_ratio = min(1.0, float(resized_w / IMG_W))

        started = time.perf_counter()
        errors = []
        try:
            raw_outputs = session.run(output_names, {input_name: tensor})
        except Exception as error:  # noqa: BLE001 - fail closed, record verbatim
            errors.append(f"{type(error).__name__}: {error}")
            raw_outputs = None
        latency_ms = (time.perf_counter() - started) * 1000.0

        if raw_outputs is None:
            with open(os.path.join(OUT_DIR, f"{invocation_id}.ABSENT-OUTPUT.md"), "w") as handle:
                handle.write(
                    f"# Absent output - {invocation_id}\n\n"
                    "Inference raised; no output produced. Nothing was fabricated.\n\n"
                    f"{errors}\n"
                )
            records.append(
                {
                    "invocationId": invocation_id,
                    "image": image_name,
                    "run": run,
                    "errors": errors,
                    "executed": False,
                }
            )
            continue

        logits = np.asarray(raw_outputs[0])
        logits_path = os.path.join(OUT_DIR, f"{invocation_id}.logits.npy")
        # Canonical unrounded binary artifact, written before anything is compared.
        np.save(logits_path, logits, allow_pickle=False)
        logits_sha = sha256_file(logits_path)
        finite = bool(np.isfinite(logits).all())

        if logits.shape[-1] != vocab_size:
            return fail(
                "OUTPUT_WIDTH_DISAGREES_WITH_VOCAB",
                {"logitsShape": list(logits.shape), "vocabSize": vocab_size},
            )

        frame = logits[0]
        # PaddleOCR's CTCLabelDecode takes argmax and max over the model output
        # directly, without a softmax, which implies the exported graph already
        # emits per-timestep probabilities. That is measured rather than assumed.
        row_sums = frame.sum(axis=-1)
        already_normalized = bool(
            np.all(frame >= -1e-6) and np.allclose(row_sums, 1.0, atol=1e-3)
        )
        shifted = frame - frame.max(axis=-1, keepdims=True)
        exponentiated = np.exp(shifted)
        softmaxed = exponentiated / exponentiated.sum(axis=-1, keepdims=True)
        model_probs = frame if already_normalized else softmaxed

        token_ids = frame.argmax(axis=-1).astype(int).tolist()
        timestep_probs_model = [float(model_probs[t, token_ids[t]]) for t in range(len(token_ids))]
        timestep_probs_softmax = [float(softmaxed[t, token_ids[t]]) for t in range(len(token_ids))]

        # CTC decoding: consecutive-duplicate removal, then blank removal.
        collapsed_ids = []
        collapsed_probs = []
        for index, token in enumerate(token_ids):
            if index > 0 and token == token_ids[index - 1]:
                continue
            collapsed_ids.append(token)
            collapsed_probs.append(timestep_probs_model[index])
        decoded_ids = [t for t in collapsed_ids if t != blank_id]
        decoded_probs = [p for t, p in zip(collapsed_ids, collapsed_probs) if t != blank_id]
        raw_transcript = "".join(charset[t] for t in decoded_ids)

        # §6.1 as frozen: mean over NON-BLANK TIME STEPS of the argmax probability.
        non_blank_step_probs = [
            timestep_probs_model[t] for t in range(len(token_ids)) if token_ids[t] != blank_id
        ]
        native_ctc_sequence_score = (
            float(sum(non_blank_step_probs) / len(non_blank_step_probs))
            if non_blank_step_probs
            else 0.0
        )
        # The pinned upstream implementation averages over the SELECTED positions
        # instead — duplicates removed and blanks removed. Reported alongside,
        # because the two definitions differ whenever adjacent frames repeat.
        upstream_collapsed_mean_score = (
            float(sum(decoded_probs) / len(decoded_probs)) if decoded_probs else 0.0
        )

        descriptor = {
            "invocationId": invocation_id,
            "image": image_name,
            "run": run,
            "engine": {
                "engineId": "pp-ocrv6-onnx",
                "onnxRuntimeVersion": ort.__version__,
            },
            "model": {
                "modelId": "pp-ocrv6-small-rec-onnx",
                "modelRepository": "PaddlePaddle/PP-OCRv6_small_rec_onnx",
                "modelCommit": MODEL_REVISION,
                "onnxSha256": onnx_sha,
                "onnxByteSize": onnx_bytes,
                "configSha256": config_sha,
                "configByteSize": EXPECTED_CONFIG_BYTES,
                "modelLicense": "Apache-2.0",
                "vocabSize": vocab_size,
                "ctcBlankTokenId": blank_id,
                "asciiSpaceInVocab": audit["asciiSpacePresent"],
                "dictSha256": audit["dictSha256"],
            },
            "input": {
                "sourceImageSha256": sha256_bytes(source_bytes),
                "sourceWidth": source_width,
                "sourceHeight": source_height,
                "modelInputHeight": IMG_H,
                "modelInputWidth": IMG_W,
                "maxConfiguredWidth": IMG_W,
                "resizedWidthBeforePadding": resized_w,
                "paddingColumnsAdded": IMG_W - resized_w,
                "validRatio": valid_ratio,
                "channelOrder": "BGR",
                "rgbConversionApplied": False,
                "transformDescription": (
                    "cv2.imdecode to BGR HWC uint8; aspect-preserving cv2.resize to height 48 "
                    "with INTER_LINEAR, width min(ceil(48*w/h), 320); float32; HWC->CHW; /255; "
                    "-0.5; /0.5; zero-padded right to width 320. Reproduces resize_norm_img "
                    "(padding=True) from the pinned PaddleOCR commit."
                ),
                "transformedTensorSha256": tensor_sha,
                "transformedTensorShape": list(tensor.shape),
                "transformedTensorDtype": str(tensor.dtype),
            },
            "output": {
                "rawLogitsArtifact": os.path.basename(logits_path),
                "logitsShape": list(logits.shape),
                "logitsDtype": str(logits.dtype),
                "logitsSha256": logits_sha,
                "logitsAllFinite": finite,
                "modelOutputAlreadyNormalized": already_normalized,
                "modelOutputRowSumMin": float(row_sums.min()),
                "modelOutputRowSumMax": float(row_sums.max()),
                "probabilitySource": "model output as emitted" if already_normalized else "softmax over model output",
                "rawTimestepTokenIds": token_ids,
                "rawTimestepProbabilities": timestep_probs_model,
                "rawTimestepProbabilitiesAfterSoftmax": timestep_probs_softmax,
                "collapsedTokenIds": collapsed_ids,
                "collapsedTokenProbabilities": collapsed_probs,
                "decodedCharacterIds": decoded_ids,
                "decodedCharacterProbabilities": decoded_probs,
                "rawTranscript": raw_transcript,
                "normalizedTranscript": normalize_transcript(raw_transcript),
                "normalizedTranscriptWhitespaceFree": normalize_transcript(raw_transcript).replace(" ", ""),
                "emptyTranscript": len(raw_transcript) == 0,
                "nativeCtcSequenceScore": native_ctc_sequence_score,
                "nativeCtcSequenceScoreDefinition": "mean over non-blank time steps of the argmax probability (§6.1 as frozen)",
                "upstreamCollapsedMeanScore": upstream_collapsed_mean_score,
                "upstreamCollapsedMeanScoreDefinition": "mean over duplicate-collapsed non-blank positions, as implemented in the pinned BaseRecLabelDecode.decode",
                "nonBlankTimestepCount": len(non_blank_step_probs),
                "decodedCharacterCount": len(decoded_ids),
                "timestepCount": len(token_ids),
            },
            "execution": {
                "decodingMode": "greedy-ctc-argmax",
                "backendUsed": "onnx-runtime",
                "onnxRuntimeProvidersUsed": providers_used,
                "onnxInputName": input_name,
                "onnxOutputNames": output_names,
                "latencyMs": latency_ms,
                "modelLoadIncludedInLatency": False,
                "modelLoadMs": load_ms,
                "peakMemoryBytes": peak_memory_bytes(),
                "warnings": [],
                "errors": errors,
            },
            "safeLoading": {
                "method": "onnxruntime.InferenceSession with CPUExecutionProvider",
                "pickleCalled": False,
                "arbitraryObjectsExecuted": False,
                "note": "ONNX Runtime loads a protobuf graph; no Python pickle is invoked.",
            },
            "boundaries": {
                "boundingBoxesEmitted": False,
                "ocrWordObjectsCreated": False,
                "authorityStateEmitted": False,
                "confidenceRescaled": False,
                "geometryFabricated": False,
                "corpusAccessed": False,
                "fixtureTruthAccessed": False,
            },
            "executed": True,
        }
        descriptor["execution"]["outputFingerprint"] = sha256_bytes(
            json.dumps(
                {"ids": token_ids, "transcript": raw_transcript},
                sort_keys=True,
                ensure_ascii=False,
            ).encode("utf-8")
        )
        with open(os.path.join(OUT_DIR, f"{invocation_id}.descriptor.json"), "w") as handle:
            json.dump(descriptor, handle, indent=2, ensure_ascii=False)
            handle.write("\n")
        records.append(descriptor)

    with open(os.path.join(OUT_DIR, "run-results.json"), "w") as handle:
        json.dump(
            {
                "artifact": "run-results",
                "experimentId": EXPERIMENT_ID,
                "plannedInvocations": 4,
                "invocations": len(records),
                "modelLoadedOnce": True,
                "paddleNativeLoadingUsed": False,
                "paddle2onnxConversionPerformed": False,
                "inferenceJsonLoaded": False,
                "detectorUsed": False,
                "ocrWordObjectsCreated": False,
                "geometryFabricated": False,
                "confidenceRescaled": False,
                "corpusAccessed": False,
                "records": records,
            },
            handle,
            indent=2,
            ensure_ascii=False,
        )
        handle.write("\n")
    print(
        json.dumps(
            {
                "status": "OK",
                "invocations": len(records),
                "transcripts": {
                    r["invocationId"]: r["output"]["rawTranscript"] for r in records if r.get("executed")
                },
            },
            indent=2,
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

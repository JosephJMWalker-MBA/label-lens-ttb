#!/usr/bin/env python3
"""Issue #149 — Arm B of the PP-OCRv6-small ONNX versus Tesseract Brand contrast.

Runs exactly twelve invocations: six opaque input PNGs, one primary and one exact
repeat each. No retry, no alternative setting, no third arm, no detector,
ensemble, lexicon, fallback or correction.

The graph emits PROBABILITIES, not logits, so no softmax is applied and the word
`logits` appears in no field or filename. The tensor is called
rawModelOutputTensor / rawProbabilityTensor, hashed as probabilityTensorSha256.

Sequence-only by construction: no bounding boxes, no OcrWord objects, no
authority state, no rescaled confidence.

Sees only opaque filenames. Runs offline, reads no corpus, no fixture truth, no
case or cluster mapping, and no Arm A evidence.
"""

import hashlib
import json
import os
import resource
import sys
import time

MODEL_PATH = "/model/inference.onnx"
CONFIG_PATH = "/config/inference.yml"
INPUT_DIR = "/inputs"
OUT_DIR = "/out"

EXPERIMENT_ID = "issue-149-brand-ppocrv6-small-onnx-contrast"
MODEL_REVISION = "b8f84f0b80c529de40b4fbb3544b84fa7233a513"

# Every one of these is frozen by the preregistration. None is read from the
# environment, and any mismatch halts before a single invocation runs.
EXPECTED_ONNX_SHA256 = "5435fd747c9e0efe15a96d0b378d5bd157e9492ed8fd80edf08f30d02fa24634"
EXPECTED_ONNX_BYTES = 21159378
EXPECTED_CONFIG_SHA256 = "ab078671bb49f06228eadccd34f1bb501e157f7a047095ffb943ba81512c77d1"
EXPECTED_CONFIG_BYTES = 150579
EXPECTED_VOCAB_SIZE = 18710
EXPECTED_DICT_LENGTH = 18708
EXPECTED_DICT_SHA256 = "42e8a0edc6ce53421aee16ff2c668b42d38a9e32a2b0056ffdcfaaeaf06f1b46"
CTC_BLANK_TOKEN_ID = 0
ASCII_SPACE_TOKEN_ID = 18709
EXPECTED_INPUT_COUNT = 6

IMG_C, IMG_H, IMG_W = 3, 48, 320
RUNS = ("primary", "repeat")


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
    record = {
        "status": "FAILED",
        "experimentId": EXPERIMENT_ID,
        "reason": reason,
        "detail": detail,
        "outputFabricated": False,
        "invocationsCompleted": 0,
    }
    with open(os.path.join(OUT_DIR, "RUN-FAILED.json"), "w") as handle:
        json.dump(record, handle, indent=2)
        handle.write("\n")
    print(json.dumps(record, indent=2), file=sys.stderr)
    return 1


def main() -> int:
    os.makedirs(OUT_DIR, exist_ok=True)

    # ---- frozen identity gates -------------------------------------------
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
    config_bytes = os.path.getsize(CONFIG_PATH)
    config_sha = sha256_file(CONFIG_PATH)
    if config_bytes != EXPECTED_CONFIG_BYTES or config_sha != EXPECTED_CONFIG_SHA256:
        return fail(
            "CONFIG_INTEGRITY_MISMATCH",
            {
                "expected": {"sha256": EXPECTED_CONFIG_SHA256, "bytes": EXPECTED_CONFIG_BYTES},
                "actual": {"sha256": config_sha, "bytes": config_bytes},
            },
        )

    import cv2
    import numpy as np
    import onnxruntime as ort
    import yaml

    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from inspect_model import string_only_loader

    # ---- charset, rebuilt and checked against the frozen expectations ----
    with open(CONFIG_PATH, "rb") as handle:
        raw_config = handle.read()
    dictionary = yaml.load(raw_config, Loader=string_only_loader(yaml))["PostProcess"][
        "character_dict"
    ]
    if len(dictionary) != EXPECTED_DICT_LENGTH:
        return fail(
            "DICTIONARY_LENGTH_MISMATCH",
            {"expected": EXPECTED_DICT_LENGTH, "actual": len(dictionary)},
        )
    dict_sha = hashlib.sha256("".join(dictionary).encode("utf-8")).hexdigest()
    if dict_sha != EXPECTED_DICT_SHA256:
        return fail("DICTIONARY_SHA256_MISMATCH", {"expected": EXPECTED_DICT_SHA256, "actual": dict_sha})

    # PaddleOCR's own construction: ["blank"] + dict + [" "] when use_space_char.
    charset = ["<blank>"] + list(dictionary) + [" "]
    if len(charset) != EXPECTED_VOCAB_SIZE:
        return fail(
            "CHARSET_LENGTH_MISMATCH",
            {"expected": EXPECTED_VOCAB_SIZE, "actual": len(charset)},
        )
    if charset[ASCII_SPACE_TOKEN_ID] != " ":
        return fail("ASCII_SPACE_TOKEN_MISPLACED", {"tokenId": ASCII_SPACE_TOKEN_ID})
    if charset[CTC_BLANK_TOKEN_ID] != "<blank>":
        return fail("BLANK_TOKEN_MISPLACED", {"tokenId": CTC_BLANK_TOKEN_ID})

    # ---- inputs -----------------------------------------------------------
    input_names = sorted(f for f in os.listdir(INPUT_DIR) if f.endswith(".png"))
    if len(input_names) != EXPECTED_INPUT_COUNT:
        return fail(
            "INPUT_COUNT_MISMATCH",
            {"expected": EXPECTED_INPUT_COUNT, "actual": len(input_names), "listing": input_names},
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
    session_vocab = session.get_outputs()[0].shape[-1]
    if isinstance(session_vocab, int) and session_vocab != EXPECTED_VOCAB_SIZE:
        return fail(
            "SESSION_VOCAB_MISMATCH",
            {"expected": EXPECTED_VOCAB_SIZE, "actual": session_vocab},
        )

    records = []
    for file_name in input_names:
        opaque_item_id = os.path.splitext(file_name)[0]
        source_path = os.path.join(INPUT_DIR, file_name)
        with open(source_path, "rb") as handle:
            source_bytes = handle.read()
        source_sha = sha256_bytes(source_bytes)

        for run in RUNS:
            invocation_id = f"B-{opaque_item_id}-{run}"

            # Frozen intrinsic preprocessing, reproducing the pinned upstream
            # resize_norm_img(padding=True). BGR throughout; no RGB conversion.
            buffer = np.frombuffer(source_bytes, dtype=np.uint8)
            image = cv2.imdecode(buffer, cv2.IMREAD_COLOR)
            if image is None:
                return fail("IMAGE_DECODE_FAILED", file_name)
            source_height, source_width = image.shape[0], image.shape[1]
            ratio = source_width / float(source_height)
            resized_w = IMG_W if int(np.ceil(IMG_H * ratio)) > IMG_W else int(np.ceil(IMG_H * ratio))
            resized = cv2.resize(image, (resized_w, IMG_H))
            resized = resized.astype("float32")
            resized = resized.transpose((2, 0, 1)) / 255.0
            resized -= 0.5
            resized /= 0.5
            padded = np.zeros((IMG_C, IMG_H, IMG_W), dtype=np.float32)
            padded[:, :, 0:resized_w] = resized
            tensor = np.ascontiguousarray(padded[np.newaxis, :, :, :], dtype=np.float32)
            tensor_sha = sha256_bytes(tensor.tobytes())

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
                        "Inference raised; no output produced. Nothing was fabricated and "
                        "no retry was attempted.\n\n"
                        f"{errors}\n"
                    )
                records.append(
                    {
                        "invocationId": invocation_id,
                        "opaqueItemId": opaque_item_id,
                        "arm": "B",
                        "run": run,
                        "errors": errors,
                        "executed": False,
                    }
                )
                continue

            probabilities = np.asarray(raw_outputs[0])
            tensor_path = os.path.join(OUT_DIR, f"{invocation_id}.probabilities.npy")
            # Canonical unrounded binary artifact, written before anything is compared.
            np.save(tensor_path, probabilities, allow_pickle=False)
            probability_tensor_sha = sha256_file(tensor_path)
            finite = bool(np.isfinite(probabilities).all())

            if probabilities.shape[-1] != EXPECTED_VOCAB_SIZE:
                return fail(
                    "OUTPUT_WIDTH_MISMATCH",
                    {"expected": EXPECTED_VOCAB_SIZE, "shape": list(probabilities.shape)},
                )

            frame = probabilities[0]
            row_sums = frame.sum(axis=-1)
            already_normalized = bool(
                np.all(frame >= -1e-6) and np.allclose(row_sums, 1.0, atol=1e-3)
            )
            if not already_normalized:
                # The frozen design applies no softmax because PR #215 measured
                # that the graph emits probabilities. If that stops being true the
                # score definitions would be meaningless, so halt rather than
                # silently changing the contract.
                return fail(
                    "MODEL_OUTPUT_NOT_NORMALIZED",
                    {
                        "invocationId": invocation_id,
                        "rowSumMin": float(row_sums.min()),
                        "rowSumMax": float(row_sums.max()),
                        "note": "No softmax may be applied under the frozen preregistration.",
                    },
                )

            token_ids = frame.argmax(axis=-1).astype(int).tolist()
            timestep_probabilities = [float(frame[t, token_ids[t]]) for t in range(len(token_ids))]

            collapsed_ids = []
            collapsed_probs = []
            for index, token in enumerate(token_ids):
                if index > 0 and token == token_ids[index - 1]:
                    continue
                collapsed_ids.append(token)
                collapsed_probs.append(timestep_probabilities[index])
            decoded_ids = [t for t in collapsed_ids if t != CTC_BLANK_TOKEN_ID]
            decoded_probs = [
                p for t, p in zip(collapsed_ids, collapsed_probs) if t != CTC_BLANK_TOKEN_ID
            ]
            raw_transcript = "".join(charset[t] for t in decoded_ids)

            non_blank_step_probs = [
                timestep_probabilities[t]
                for t in range(len(token_ids))
                if token_ids[t] != CTC_BLANK_TOKEN_ID
            ]
            plan_defined = (
                float(sum(non_blank_step_probs) / len(non_blank_step_probs))
                if non_blank_step_probs
                else 0.0
            )
            upstream_collapsed = (
                float(sum(decoded_probs) / len(decoded_probs)) if decoded_probs else 0.0
            )

            descriptor = {
                "invocationId": invocation_id,
                "opaqueItemId": opaque_item_id,
                "arm": "B",
                "run": run,
                "engine": {
                    "engineId": "pp-ocrv6-onnx",
                    "onnxRuntimeVersion": ort.__version__,
                    "providersUsed": providers_used,
                    "onnxInputName": input_name,
                    "onnxOutputNames": output_names,
                    "python": sys.version.split()[0],
                    "numpy": np.__version__,
                    "opencv": cv2.__version__,
                },
                "model": {
                    "modelId": "pp-ocrv6-small-rec-onnx",
                    "modelRepository": "PaddlePaddle/PP-OCRv6_small_rec_onnx",
                    "modelCommit": MODEL_REVISION,
                    "onnxSha256": onnx_sha,
                    "onnxByteSize": onnx_bytes,
                    "configSha256": config_sha,
                    "configByteSize": config_bytes,
                    "vocabSize": EXPECTED_VOCAB_SIZE,
                    "ctcBlankTokenId": CTC_BLANK_TOKEN_ID,
                    "asciiSpaceTokenId": ASCII_SPACE_TOKEN_ID,
                    "dictSha256": dict_sha,
                },
                "input": {
                    "sourcePngSha256": source_sha,
                    "sourceWidth": source_width,
                    "sourceHeight": source_height,
                    "modelInputHeight": IMG_H,
                    "modelInputWidth": IMG_W,
                    "maxConfiguredWidth": IMG_W,
                    "resizedWidthBeforePadding": resized_w,
                    "paddingColumnsAdded": IMG_W - resized_w,
                    "validRatio": min(1.0, float(resized_w / IMG_W)),
                    "channelOrder": "BGR",
                    "rgbConversionApplied": False,
                    "transformDescription": (
                        "cv2.imdecode to BGR HWC uint8; aspect-preserving cv2.resize to height 48 "
                        "with INTER_LINEAR, width min(ceil(48*w/h), 320); float32; HWC->CHW; /255; "
                        "-0.5; /0.5; zero-padded right to width 320."
                    ),
                    "transformedTensorSha256": tensor_sha,
                    "transformedTensorShape": list(tensor.shape),
                    "transformedTensorDtype": str(tensor.dtype),
                },
                "output": {
                    "rawModelOutputTensor": os.path.basename(tensor_path),
                    "rawProbabilityTensor": os.path.basename(tensor_path),
                    "probabilityTensorSha256": probability_tensor_sha,
                    "probabilityTensorShape": list(probabilities.shape),
                    "probabilityTensorDtype": str(probabilities.dtype),
                    "probabilityTensorAllFinite": finite,
                    "modelOutputAlreadyNormalized": True,
                    "modelOutputRowSumMin": float(row_sums.min()),
                    "modelOutputRowSumMax": float(row_sums.max()),
                    "softmaxApplied": False,
                    "rawTimestepTokenIds": token_ids,
                    "rawTimestepProbabilities": timestep_probabilities,
                    "collapsedTokenIds": collapsed_ids,
                    "collapsedTokenProbabilities": collapsed_probs,
                    "decodedCharacterIds": decoded_ids,
                    "decodedCharacterProbabilities": decoded_probs,
                    "rawTranscript": raw_transcript,
                    "emptyTranscript": len(raw_transcript) == 0,
                    "timestepCount": len(token_ids),
                    "nonBlankTimestepCount": len(non_blank_step_probs),
                    "decodedCharacterCount": len(decoded_ids),
                    "planDefinedNonBlankTimestepMean": plan_defined,
                    "upstreamCollapsedSequenceMean": upstream_collapsed,
                },
                "execution": {
                    "decodingMode": "greedy-ctc-argmax",
                    "backendUsed": "onnx-runtime",
                    "duplicateRemoval": True,
                    "blankRemoval": True,
                    "dictionaryCorrection": False,
                    "truthGuidedChanges": False,
                    "detectorUsed": False,
                    "ensembleUsed": False,
                    "lexiconUsed": False,
                    "fallbackUsed": False,
                    "latencyMs": latency_ms,
                    "modelLoadIncludedInLatency": False,
                    "modelLoadMs": load_ms,
                    "peakMemoryBytes": peak_memory_bytes(),
                    "warnings": [],
                    "errors": errors,
                },
                "boundaries": {
                    "boundingBoxesEmitted": False,
                    "ocrWordObjectsCreated": False,
                    "authorityStateEmitted": False,
                    "confidenceRescaled": False,
                    "geometryFabricated": False,
                    "caseIdsVisible": False,
                    "brandTruthVisible": False,
                    "clusterMappingVisible": False,
                    "armAEvidenceVisible": False,
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

    with open(os.path.join(OUT_DIR, "arm-b-run-results.json"), "w") as handle:
        json.dump(
            {
                "artifact": "arm-b-run-results",
                "experimentId": EXPERIMENT_ID,
                "plannedInvocations": 12,
                "invocations": len(records),
                "inputCount": len(input_names),
                "runsPerInput": list(RUNS),
                "retriesAttempted": 0,
                "modelLoadedOnce": True,
                "softmaxApplied": False,
                "paddleNativeLoadingUsed": False,
                "paddle2onnxConversionPerformed": False,
                "inferenceJsonLoaded": False,
                "detectorUsed": False,
                "thirdArmPresent": False,
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
                    r["invocationId"]: r["output"]["rawTranscript"]
                    for r in records
                    if r.get("executed")
                },
            },
            indent=2,
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

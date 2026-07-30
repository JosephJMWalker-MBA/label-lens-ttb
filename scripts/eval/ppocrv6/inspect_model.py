#!/usr/bin/env python3
"""Issue #149 — PP-OCRv6-small ONNX probe: dry session load and dictionary audit.

Covers plan §17 Phase 0 step 6 (pinned ONNX Runtime container, dry session load,
opset / input / output metadata) and step 9 (dictionary audit). No inference runs
here: the session is created and interrogated, and `session.run` is never called.

Fails closed. If the mounted ONNX bytes do not match the pinned SHA-256 and byte
size, or the vocabulary cannot be reconciled against the character dictionary,
nothing is written except the failure record and the exit status is non-zero.

Reads no corpus and no fixture truth.
"""

import hashlib
import json
import os
import sys

MODEL_PATH = "/model/inference.onnx"
CONFIG_PATH = "/config/inference.yml"
OUT_DIR = "/out"

EXPERIMENT_ID = "issue-149-ppocrv6-small-onnx-compatibility-probe"
MODEL_REVISION = "b8f84f0b80c529de40b4fbb3544b84fa7233a513"
EXPECTED_ONNX_SHA256 = "5435fd747c9e0efe15a96d0b378d5bd157e9492ed8fd80edf08f30d02fa24634"
EXPECTED_ONNX_BYTES = 21159378
EXPECTED_CONFIG_SHA256 = "ab078671bb49f06228eadccd34f1bb501e157f7a047095ffb943ba81512c77d1"
EXPECTED_CONFIG_BYTES = 150579

# The blank index and the trailing-space rule are not assumed; they are the
# documented behaviour of PaddleOCR's own decoder, confirmed during discovery:
#   BaseRecLabelDecode.__init__  -> if use_space_char: character_str.append(" ")
#   CTCLabelDecode.add_special_char -> dict_character = ["blank"] + dict_character
#   BaseRecLabelDecode.get_ignored_tokens -> [0]  # for ctc blank
POSTPROCESSOR_SOURCE = (
    "ppocr/postprocess/rec_postprocess.py at PaddleOCR commit "
    "2661c7c0ef5c613e8f93c6e93b2e052399f0f854"
)


def sha256_file(path: str) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def fail(gate: str, reason: str, detail) -> int:
    os.makedirs(OUT_DIR, exist_ok=True)
    record = {
        "status": "BLOCKED_DISCOVERY",
        "gate": gate,
        "reason": reason,
        "detail": detail,
        "inferencePerformed": False,
    }
    with open(os.path.join(OUT_DIR, "DISCOVERY-BLOCKED.json"), "w") as handle:
        json.dump(record, handle, indent=2)
        handle.write("\n")
    print(json.dumps(record, indent=2), file=sys.stderr)
    return 1


def string_only_loader(yaml):
    """A SafeLoader with every implicit scalar resolver removed.

    The character dictionary contains bare `y`, `Y`, `n` and `N` entries. Rather
    than reason about which YAML 1.1 boolean spellings PyYAML happens to resolve,
    all plain scalars are read as strings so the dictionary cannot be silently
    retyped.
    """

    class StringOnlyLoader(yaml.SafeLoader):
        pass

    StringOnlyLoader.yaml_implicit_resolvers = {}
    return StringOnlyLoader


def main() -> int:
    os.makedirs(OUT_DIR, exist_ok=True)

    # ---- integrity gates on the mounted inputs ---------------------------
    onnx_bytes = os.path.getsize(MODEL_PATH)
    onnx_sha = sha256_file(MODEL_PATH)
    if onnx_bytes != EXPECTED_ONNX_BYTES or onnx_sha != EXPECTED_ONNX_SHA256:
        return fail(
            "onnx-integrity",
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
            "config-integrity",
            "CONFIG_INTEGRITY_MISMATCH",
            {
                "expected": {"sha256": EXPECTED_CONFIG_SHA256, "bytes": EXPECTED_CONFIG_BYTES},
                "actual": {"sha256": config_sha, "bytes": config_bytes},
            },
        )

    import numpy as np
    import onnx
    import onnxruntime as ort
    import yaml

    # ---- graph metadata and opset ----------------------------------------
    model_proto = onnx.load(MODEL_PATH)
    opsets = [
        {"domain": entry.domain or "ai.onnx", "version": entry.version}
        for entry in model_proto.opset_import
    ]
    graph_outputs = []
    for value in model_proto.graph.output:
        dims = []
        for dim in value.type.tensor_type.shape.dim:
            dims.append(dim.dim_value if dim.HasField("dim_value") else (dim.dim_param or "?"))
        graph_outputs.append({"name": value.name, "dims": dims})
    one_dim_initializers = [
        {"name": init.name, "dim": int(init.dims[0])}
        for init in model_proto.graph.initializer
        if len(init.dims) == 1 and int(init.dims[0]) > 1000
    ]

    # ---- dry session load: create, interrogate, never run -----------------
    options = ort.SessionOptions()
    options.intra_op_num_threads = 1
    options.inter_op_num_threads = 1
    options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
    session = ort.InferenceSession(
        MODEL_PATH, sess_options=options, providers=["CPUExecutionProvider"]
    )
    meta = session.get_modelmeta()
    inputs = [{"name": i.name, "shape": i.shape, "type": i.type} for i in session.get_inputs()]
    outputs = [{"name": o.name, "shape": o.shape, "type": o.type} for o in session.get_outputs()]

    # ---- vocabulary size, in the order §17 prescribes ---------------------
    vocab_size = None
    vocab_source = None
    last = outputs[0]["shape"][-1] if outputs and outputs[0]["shape"] else None
    if isinstance(last, int) and last > 0:
        vocab_size, vocab_source = last, "session.get_outputs()[0].shape[-1]"
    else:
        graph_last = graph_outputs[0]["dims"][-1] if graph_outputs and graph_outputs[0]["dims"] else None
        if isinstance(graph_last, int) and graph_last > 0:
            vocab_size, vocab_source = graph_last, "onnx graph.output[0] static last dimension"
        elif len(one_dim_initializers) == 1:
            vocab_size = one_dim_initializers[0]["dim"]
            vocab_source = f"sole large 1-D initializer {one_dim_initializers[0]['name']}"
    if vocab_size is None:
        return fail(
            "vocab-size",
            "VOCAB_SIZE_UNRESOLVED",
            {
                "sessionOutputShape": outputs[0]["shape"] if outputs else None,
                "graphOutputs": graph_outputs,
                "largeOneDimInitializers": one_dim_initializers,
            },
        )

    # ---- dictionary audit -------------------------------------------------
    with open(CONFIG_PATH, "rb") as handle:
        raw_config = handle.read()
    typed = yaml.safe_load(raw_config)
    as_strings = yaml.load(raw_config, Loader=string_only_loader(yaml))
    dictionary = as_strings["PostProcess"]["character_dict"]
    non_strings = [i for i, ch in enumerate(dictionary) if not isinstance(ch, str)]
    if non_strings:
        return fail("dictionary", "NON_STRING_DICTIONARY_ENTRY", non_strings[:20])

    dict_length = len(dictionary)
    dict_string = "".join(dictionary)
    dict_sha256 = hashlib.sha256(dict_string.encode("utf-8")).hexdigest()
    space_in_dictionary = " " in dictionary

    # Reconcile the model's output width against the dictionary using
    # PaddleOCR's own decoder construction. Fail closed on anything else.
    if vocab_size == dict_length + 2:
        charset = ["<blank>"] + list(dictionary) + [" "]
        space_appended = True
        reconciliation = "vocabSize == len(character_dict) + 2: ['blank'] + dict + [' ']"
    elif vocab_size == dict_length + 1:
        charset = ["<blank>"] + list(dictionary)
        space_appended = False
        reconciliation = "vocabSize == len(character_dict) + 1: ['blank'] + dict"
    else:
        return fail(
            "dictionary",
            "VOCAB_RECONCILIATION_FAILED",
            {
                "vocabSize": vocab_size,
                "vocabSizeSource": vocab_source,
                "characterDictLength": dict_length,
                "acceptedRelations": ["vocabSize == len+1", "vocabSize == len+2"],
            },
        )

    ascii_space_decodable = space_in_dictionary or space_appended
    space_token_ids = [i for i, ch in enumerate(charset) if ch == " "]

    audit = {
        "artifact": "dictionary-audit",
        "experimentId": EXPERIMENT_ID,
        "source": f"PostProcess.character_dict in inference.yml at {MODEL_REVISION}",
        "configSha256": config_sha,
        "yamlParsing": "SafeLoader with all implicit scalar resolvers removed, so bare y/Y/n/N cannot be retyped as booleans",
        "postProcessName": typed["PostProcess"]["name"],
        # §11's asciiSpacePresent is documented both as "appears as a decodable
        # token" and as "determined by inspecting PostProcess.character_dict".
        # For this artifact the two readings diverge, so both are reported and the
        # field carries the decodable-token reading, which is its first sentence.
        "asciiSpacePresent": ascii_space_decodable,
        "asciiSpacePresentDefinitionUsed": "appears as a decodable token in the constructed charset",
        "asciiSpaceInInferenceYmlDict": space_in_dictionary,
        "asciiSpaceAppendedByPostprocessor": space_appended,
        "asciiSpaceTokenIds": space_token_ids,
        "definitionNote": (
            "ASCII space is absent from the inference.yml character_dict, exactly as the plan "
            "records. Whether it is decodable is a separate question, settled here by "
            "reconciling the model's output width against the dictionary length using "
            "PaddleOCR's own decoder construction."
        ),
        "firstCharacter": dictionary[0],
        "lastCharacter": dictionary[-1],
        "nonBlankCharacterCount": len(charset) - 1,
        "characterDictLength": dict_length,
        "entriesWithLengthNotOne": [
            {"index": i, "value": ch, "codepoints": len(ch)}
            for i, ch in enumerate(dictionary)
            if len(ch) != 1
        ][:20],
        "dictSha256": dict_sha256,
        "dictStringCodepoints": len(dict_string),
        "vocabSize": vocab_size,
        "vocabSizeSource": vocab_source,
        "vocabReconciliation": reconciliation,
        "ctcBlankTokenId": 0,
        "ctcBlankTokenIdCandidateSource": POSTPROCESSOR_SOURCE,
        "ctcBlankAtIndexZeroNotVocabMinusOne": True,
        "charsetSha256": hashlib.sha256(" ".join(charset).encode("utf-8")).hexdigest(),
    }
    with open(os.path.join(OUT_DIR, "dictionary-audit.json"), "w") as handle:
        json.dump(audit, handle, indent=2, ensure_ascii=False)
        handle.write("\n")

    inspection = {
        "artifact": "onnx-graph-inspection",
        "experimentId": EXPERIMENT_ID,
        "dryRun": True,
        "sessionRunCalled": False,
        "onnxSha256": onnx_sha,
        "onnxByteSize": onnx_bytes,
        "modelRevision": MODEL_REVISION,
        "opsetImports": opsets,
        "irVersion": model_proto.ir_version,
        "producerName": model_proto.producer_name,
        "producerVersion": model_proto.producer_version,
        "modelMeta": {
            "producerName": meta.producer_name,
            "graphName": meta.graph_name,
            "domain": meta.domain,
            "description": meta.description,
            "version": meta.version,
            "customMetadataMap": dict(meta.custom_metadata_map),
        },
        "inputs": inputs,
        "outputs": outputs,
        "graphOutputsStatic": graph_outputs,
        "largeOneDimInitializers": one_dim_initializers,
        "providersAvailable": list(ort.get_available_providers()),
        "providersRequested": ["CPUExecutionProvider"],
        "providersUsed": list(session.get_providers()),
        "sessionOptions": {
            "intraOpNumThreads": 1,
            "interOpNumThreads": 1,
            "executionMode": "ORT_SEQUENTIAL",
            "graphOptimizationLevel": "default",
        },
        "runtime": {
            "python": sys.version.split()[0],
            "onnxruntime": ort.__version__,
            "onnx": onnx.__version__,
            "numpy": np.__version__,
        },
    }
    with open(os.path.join(OUT_DIR, "onnx-graph-inspection.json"), "w") as handle:
        json.dump(inspection, handle, indent=2)
        handle.write("\n")

    safe_loading = {
        "artifact": "safe-loading-report",
        "experimentId": EXPERIMENT_ID,
        "method": "onnxruntime.InferenceSession with CPUExecutionProvider",
        "pickleCalled": False,
        "arbitraryObjectsExecuted": False,
        "note": (
            "ONNX Runtime loads a protobuf graph. No Python pickle is invoked and no "
            "PaddlePaddle weight format is parsed, so the .pdiparams pickle concern raised "
            "for the native Paddle artifact does not apply to this probe. The bytes were "
            "additionally gated on the pinned SHA-256 and byte size before the session was "
            "created."
        ),
        "paddleNativeLoadingUsed": False,
        "paddle2onnxConversionPerformed": False,
        "inferenceJsonLoaded": False,
        "onnxSha256Verified": True,
        "onnxSha256": onnx_sha,
        "onnxByteSize": onnx_bytes,
        "configSha256Verified": True,
        "configSha256": config_sha,
    }
    with open(os.path.join(OUT_DIR, "safe-loading-report.json"), "w") as handle:
        json.dump(safe_loading, handle, indent=2)
        handle.write("\n")

    print(
        json.dumps(
            {
                "status": "OK",
                "opsetImports": opsets,
                "inputs": inputs,
                "outputs": outputs,
                "vocabSize": vocab_size,
                "vocabSizeSource": vocab_source,
                "characterDictLength": dict_length,
                "asciiSpaceInInferenceYmlDict": space_in_dictionary,
                "asciiSpaceDecodable": ascii_space_decodable,
                "ctcBlankTokenId": 0,
                "sessionRunCalled": False,
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

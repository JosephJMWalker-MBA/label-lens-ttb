# Private vision reader on a Jetson Orin

Label Lens can read seller-marked label regions with a vision-language model that runs on hardware you own. Label artwork never leaves your network: the application refuses to connect to any address that is not private (see `src/server/vision/private-network.ts`), and there is no setting that overrides that.

```text
Label Lens (laptop or LAN server)          Jetson Orin (same LAN or Tailscale)
  /api/package/analyze                       llama-server  :8080
    └─ crop the seller's region  ── HTTP ──▶   vision model + projector
       send only those pixels     ◀─ JSON ──   {"lines": [...], "legibility": "clear"}
    └─ deterministic parsing and rules
```

The model only transcribes. It never sees the seller's declared value, never decides whether a label passes, and its output is recorded as untrusted evidence with full provenance (model, prompt digest, image digest, latency).

> **Status:** this kit was written from documentation and has not yet been run on the target Orin. Run it with the maintainer the first time, and record what changed in this file.

## 1. Check the Orin

```bash
cat /etc/nv_tegra_release
```

```bash
/usr/local/cuda/bin/nvcc --version
```

```bash
free -h
```

Record the module (AGX Orin 64/32 GB, Orin NX 16 GB, Orin Nano 8 GB), JetPack/L4T release, and CUDA version. Memory decides the model.

## 2. Build `llama-server` with CUDA

```bash
sudo LLAMA_CPP_REF=<tag-or-commit> ./deploy/orin/install-llama-server.sh
```

The script installs build tools, clones `ggml-org/llama.cpp` to `/opt/llama.cpp`, checks out the ref you pin, and builds `llama-server` for the Orin GPU (compute capability 8.7). Pin a ref so the reader's identity is reproducible; the ref is printed at the end.

## 3. Choose and download a model

Pick by memory, then confirm the exact GGUF file names on the model's Hugging Face page (they change between releases):

| Orin | Starting candidates (GGUF, with matching `mmproj`) |
| --- | --- |
| AGX Orin 64 GB / 32 GB | Qwen2.5-VL-7B-Instruct Q8_0, or a newer Qwen-VL generation if llama.cpp supports it |
| Orin NX 16 GB | Qwen2.5-VL-7B-Instruct Q4_K_M |
| Orin Nano 8 GB | Qwen2.5-VL-3B-Instruct Q4_K_M |

Do not pick on reputation. Download two candidates and let `npm run vision:eval` choose: the corpus numbers decide.

```bash
sudo ./deploy/orin/fetch-model.sh <hf-repo> <model-file.gguf> <mmproj-file.gguf>
```

Files land in `/opt/label-lens-vision/models/`, and their SHA-256 digests are printed for the provenance record. The download is the only time the Orin needs the internet.

## 4. Configure and start the service

```bash
sudo ./deploy/orin/configure-service.sh
```

It creates a `labellens` service user, generates a random API key in `/etc/label-lens-vision/api-key` (mode 600), writes `/etc/label-lens-vision/vision.env` from `vision.env.example`, and installs `label-lens-vision.service`. Edit `vision.env` to point at the model you downloaded and the LAN address to bind, then:

```bash
sudo systemctl enable --now label-lens-vision
```

```bash
journalctl -u label-lens-vision -f
```

Allow only your LAN (or Tailscale) to reach the port. With `ufw`, for example:

```bash
sudo ufw allow from 192.168.1.0/24 to any port 8080 proto tcp
```

## 5. Point Label Lens at it

On the machine running Label Lens, add to `.env.local`:

```bash
LABEL_LENS_VISION_ENDPOINT=http://<orin-lan-ip>:8080
LABEL_LENS_VISION_API_KEY=<contents of /etc/label-lens-vision/api-key>
LABEL_LENS_VISION_MODEL=<the --alias set in vision.env>
LABEL_LENS_VISION_LABEL=orin-01
```

Then check it:

```bash
npm run vision:check
```

`/api/health` reports `"visionReader": "configured"` once the settings are valid (it never contacts the Orin).

If the server rejects structured output, set `LABEL_LENS_VISION_STRUCTURED_OUTPUT=off`; replies are still validated strictly.

## 6. Measure before trusting it

```bash
npm run vision:eval
```

This runs the frozen wine corpus from the OCR research (Issue #149):

- **Whole label (115 cases):** is the true brand / alcohol statement present in what the model read? Compare with the Tesseract reference printed in the report.
- **Bounded brand (10 human-approved regions):** the exact production path. Watch `reliableButWrong`; it must stay at zero.

Reports are written to `.local-vision/` (git-ignored). Commit a report under `artifacts/` only when it is the evidence for a model choice.

## Failure behaviour

If the Orin is off, slow, or answers with anything that is not a valid transcription, analysis continues with local OCR for those regions. Each reading records `visionFallback` with the reason, and the seller's technical details say which reader ran. A partial or unsafe configuration stops analysis with `VISION_READER_MISCONFIGURED`, so an operator can never think the reader is on when it is not.

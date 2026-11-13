"""Offline Thai speech synthesis using Facebook MMS VITS (CC BY-NC 4.0).

First use downloads the public model from Hugging Face into the local HF cache.
This script intentionally emits only synthesized audio and never uploads text.
"""
from __future__ import annotations

import sys
import json
import wave
from pathlib import Path


def load_model(local_files_only: bool = False):
    try:
        import numpy as np
        import torch
        from transformers import AutoTokenizer, VitsModel
    except ImportError as exc:
        raise RuntimeError("Local Thai TTS requires Python packages torch, transformers, and numpy. See Settings → Thai playback.") from exc

    model_name = "facebook/mms-tts-tha"
    tokenizer = AutoTokenizer.from_pretrained(model_name, local_files_only=local_files_only)
    model = VitsModel.from_pretrained(model_name, local_files_only=local_files_only)
    # Windows ROCm builds have crashed in HIP profiler code on this host. This
    # compact 36M-parameter voice is fast enough on CPU and avoids that native path.
    device = "cpu"
    model = model.to(device).eval()
    return np, torch, tokenizer, model, device


def synthesize(text: str, output: Path, runtime=None) -> None:
    if not text.strip() or len(text) > 20_000:
        raise ValueError("Provide Thai text under 20,000 characters.")
    np, torch, tokenizer, model, device = runtime or load_model()
    inputs = tokenizer(text, return_tensors="pt")
    inputs = {key: value.to(device) for key, value in inputs.items()}
    with torch.inference_mode():
        waveform = model(**inputs).waveform[0].float().cpu().numpy()
    if waveform.size == 0 or not np.isfinite(waveform).all():
        raise RuntimeError("The Thai TTS model returned empty or invalid audio.")
    samples = (np.clip(waveform, -1.0, 1.0) * 32767).astype("<i2")
    sample_rate = int(model.config.sampling_rate)
    output.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(output), "wb") as writer:
        writer.setnchannels(1)
        writer.setsampwidth(2)
        writer.setframerate(sample_rate)
        writer.writeframes(samples.tobytes())


def serve(local_files_only: bool = False) -> None:
    """Keep the model resident and handle newline-delimited requests on stdio."""
    import base64
    import io

    np, torch, tokenizer, model, device = load_model(local_files_only=local_files_only)
    print('{"ready":true}', flush=True)
    for line in sys.stdin:
        try:
            request = json.loads(line)
            text = request.get("text", "")
            steady = request.get("steady") is True
            if not isinstance(text, str) or not text.strip() or len(text) > 20_000:
                raise ValueError("Provide Thai text under 20,000 characters.")
            inputs = tokenizer(text, return_tensors="pt")
            if inputs["input_ids"].shape[1] == 0:
                raise ValueError("The local Thai voice could not read any characters in this text.")
            inputs = {key: value.to(device) for key, value in inputs.items()}
            original_noise_scale = model.noise_scale
            original_duration_noise = model.noise_scale_duration
            if steady:
                # VITS samples acoustic detail and phoneme duration. For a single
                # dictionary word, stochastic timing makes repeated plays vary
                # noticeably, so use the model's deterministic central prediction.
                model.noise_scale = 0.0
                model.noise_scale_duration = 0.0
            with torch.inference_mode():
                try:
                    waveform = model(**inputs).waveform[0].float().cpu().numpy()
                finally:
                    model.noise_scale = original_noise_scale
                    model.noise_scale_duration = original_duration_noise
            if waveform.size == 0 or not np.isfinite(waveform).all():
                raise RuntimeError("The Thai TTS model returned empty or invalid audio.")
            samples = (np.clip(waveform, -1.0, 1.0) * 32767).astype("<i2")
            output = io.BytesIO()
            with wave.open(output, "wb") as writer:
                writer.setnchannels(1)
                writer.setsampwidth(2)
                writer.setframerate(int(model.config.sampling_rate))
                writer.writeframes(samples.tobytes())
            print(json.dumps({"audio": base64.b64encode(output.getvalue()).decode("ascii")} ), flush=True)
        except Exception as exc:
            print(json.dumps({"error": str(exc)}), flush=True)


if __name__ == "__main__" and sys.argv[1:2] == ["--server"]:
    try:
        serve(local_files_only="--local-only" in sys.argv[2:])
    except Exception as exc:
        print(f"Thai TTS error: {exc}", file=sys.stderr, flush=True)
        raise SystemExit(1)
elif __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Usage: tts_local_mms.py <Thai text> <output.wav>")
    try:
        synthesize(sys.argv[1], Path(sys.argv[2]))
    except Exception as exc:
        print(f"Thai TTS error: {exc}", file=sys.stderr)
        raise SystemExit(1)

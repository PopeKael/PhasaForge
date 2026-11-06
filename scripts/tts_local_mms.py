"""Offline Thai speech synthesis using Facebook MMS VITS (CC BY-NC 4.0).

First use downloads the public model from Hugging Face into the local HF cache.
This script intentionally emits only synthesized audio and never uploads text.
"""
from __future__ import annotations

import sys
import wave
from pathlib import Path


def synthesize(text: str, output: Path) -> None:
    if not text.strip() or len(text) > 20_000:
        raise ValueError("Provide Thai text under 20,000 characters.")
    try:
        import numpy as np
        import torch
        from transformers import AutoTokenizer, VitsModel
    except ImportError as exc:
        raise RuntimeError("Local Thai TTS requires Python packages torch, transformers, and numpy. See Settings → Thai playback.") from exc

    model_name = "facebook/mms-tts-tha"
    tokenizer = AutoTokenizer.from_pretrained(model_name)
    model = VitsModel.from_pretrained(model_name)
    # Windows ROCm builds have crashed in HIP profiler code on this host. This
    # compact 36M-parameter voice is fast enough on CPU and avoids that native path.
    device = "cpu"
    model = model.to(device).eval()
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


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Usage: tts_local_mms.py <Thai text> <output.wav>")
    try:
        synthesize(sys.argv[1], Path(sys.argv[2]))
    except Exception as exc:
        print(f"Thai TTS error: {exc}", file=sys.stderr)
        raise SystemExit(1)

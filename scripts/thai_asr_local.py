"""Prepare and run PhasaForge's optional local Thai speech recognizer."""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tarfile
import urllib.request
import wave
from pathlib import Path

MODEL_NAME = "sherpa-onnx-zipformer-thai-2024-06-20"
MODEL_URL = f"https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/{MODEL_NAME}.tar.bz2"
SHERPA_VERSION = "2.0.1"
NUMPY_VERSION = "1.26.4"


def emit(value: dict) -> None:
    print(json.dumps(value, ensure_ascii=False), flush=True)


def python_in(venv: Path) -> Path:
    return venv / "Scripts" / "python.exe" if os.name == "nt" else venv / "bin" / "python"


def safe_extract(archive: Path, destination: Path) -> None:
    destination.mkdir(parents=True, exist_ok=True)
    root = destination.resolve()
    wanted = {
        f"{MODEL_NAME}/tokens.txt",
        f"{MODEL_NAME}/encoder-epoch-12-avg-5.int8.onnx",
        f"{MODEL_NAME}/decoder-epoch-12-avg-5.onnx",
        f"{MODEL_NAME}/joiner-epoch-12-avg-5.int8.onnx",
    }
    with tarfile.open(archive, "r:bz2") as tar:
        members = tar.getmembers()
        for member in members:
            target = (destination / member.name).resolve()
            if root not in target.parents and target != root:
                raise RuntimeError("The Thai model archive contains an unsafe path.")
            if member.issym() or member.islnk() or member.isdev():
                raise RuntimeError("The Thai model archive contains an unsupported file type.")
        selected = [member for member in members if member.name in wanted or member.name.rstrip("/") == MODEL_NAME]
        if not wanted.issubset({member.name for member in selected}):
            raise RuntimeError("The Thai model archive is missing a required model file.")
        tar.extractall(destination, members=selected)


def prepare(data: Path) -> None:
    if sys.version_info < (3, 10):
        raise RuntimeError("Local Thai recognition requires Python 3.10 or later.")
    data.mkdir(parents=True, exist_ok=True)
    env = data / "python-env"
    env_python = python_in(env)
    if not env_python.exists():
        emit({"progress": "Creating an isolated Thai recognition environment…"})
        subprocess.run([sys.executable, "-m", "venv", str(env)], check=True)

    # sherpa-onnx's Python wheel does not install NumPy, which our WAV decoder
    # needs. Install both explicitly so a completed preparation is runnable.
    imports_ok = subprocess.run(
        [str(env_python), "-c", "import numpy, sherpa_onnx"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    ).returncode == 0
    if not imports_ok:
        emit({"progress": "Installing the local CPU speech-recognition engine and audio support…"})
        subprocess.run(
            [
                str(env_python), "-m", "pip", "install", "--disable-pip-version-check",
                f"sherpa-onnx=={SHERPA_VERSION}", f"numpy=={NUMPY_VERSION}",
            ],
            check=True,
        )
    subprocess.run(
        [str(env_python), "-c", "import numpy, sherpa_onnx"],
        check=True,
    )

    model = data / "model" / MODEL_NAME
    if not (model / "tokens.txt").is_file():
        emit({"progress": "Downloading the Thai recognition model (about 150 MB after extraction)…"})
        model_parent = model.parent
        model_parent.mkdir(parents=True, exist_ok=True)
        archive = data / f"{MODEL_NAME}.tar.bz2.part"
        unpacked = data / f"{MODEL_NAME}.unpacking"
        try:
            request = urllib.request.Request(MODEL_URL, headers={"User-Agent": "PhasaForge/0.3.6"})
            with urllib.request.urlopen(request, timeout=60) as response, archive.open("wb") as output:
                shutil.copyfileobj(response, output)
            if unpacked.exists():
                shutil.rmtree(unpacked)
            safe_extract(archive, unpacked)
            extracted = unpacked / MODEL_NAME
            if not (extracted / "tokens.txt").is_file():
                raise RuntimeError("The downloaded Thai model did not contain its expected files.")
            if model.exists():
                shutil.rmtree(model)
            shutil.move(str(extracted), str(model))
        finally:
            archive.unlink(missing_ok=True)
            if unpacked.exists():
                shutil.rmtree(unpacked)

    emit({"ready": True})


def transcribe(data: Path, wav_path: Path) -> None:
    try:
        import numpy as np
        import sherpa_onnx
    except ImportError as exc:
        raise RuntimeError(f"A Thai recognition Python dependency is missing ({exc.name}). Open Setup and prepare recognition again.") from exc

    model = data / "model" / MODEL_NAME
    required = [
        model / "tokens.txt",
        model / "encoder-epoch-12-avg-5.int8.onnx",
        model / "decoder-epoch-12-avg-5.onnx",
        model / "joiner-epoch-12-avg-5.int8.onnx",
    ]
    if not all(path.is_file() for path in required):
        raise RuntimeError("The local Thai recognition model is incomplete. Prepare it again in Settings.")

    with wave.open(str(wav_path), "rb") as audio:
        if audio.getnchannels() != 1 or audio.getsampwidth() != 2:
            raise RuntimeError("The captured audio format could not be read for Thai recognition.")
        rate = audio.getframerate()
        raw = audio.readframes(audio.getnframes())
    samples = np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0
    if not samples.size:
        raise RuntimeError("No microphone audio was captured.")

    recognizer = sherpa_onnx.OfflineRecognizer.from_transducer(
        encoder=str(required[1]), decoder=str(required[2]), joiner=str(required[3]), tokens=str(required[0]),
        num_threads=1, sample_rate=rate, feature_dim=80, decoding_method="greedy_search", provider="cpu",
    )
    stream = recognizer.create_stream()
    stream.accept_waveform(rate, samples)
    recognizer.decode_stream(stream)
    emit({"text": stream.result.text.strip()})


def main() -> int:
    if len(sys.argv) < 3:
        print("Usage: thai_asr_local.py --prepare DATA_DIR | --transcribe DATA_DIR WAV_FILE", file=sys.stderr)
        return 2
    mode = sys.argv[1]
    data = Path(sys.argv[2])
    try:
        if mode == "--prepare":
            prepare(data)
        elif mode == "--transcribe" and len(sys.argv) == 4:
            transcribe(data, Path(sys.argv[3]))
        else:
            raise RuntimeError("Unknown local Thai recognition operation.")
        return 0
    except Exception as exc:
        print(str(exc), file=sys.stderr, flush=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

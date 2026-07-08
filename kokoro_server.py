#!/usr/bin/env python3
"""Minimal HTTP server wrapping Kokoro TTS. Zero extra deps beyond what's already in the venv.

Usage:
    source ../VoicetoSpeechwithMath/venv/bin/activate
    python kokoro_server.py

Then POST JSON {"text": "..."} to http://localhost:8765/tts → get MP3 audio back.
"""

import json
import io
import subprocess
import sys
import wave
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path

import numpy as np

VENV_PYTHON = str(Path(__file__).resolve().parent.parent / "VoicetoSpeechwithMath" / "venv" / "bin" / "python")

VOICE = "af_heart"
SPEED = 1.0
PORT = 8765
MP3_BITRATE = "64k"


def wav_to_mp3(wav_bytes: bytes) -> bytes:
    try:
        result = subprocess.run(
            [
                "ffmpeg", "-hide_banner", "-loglevel", "error",
                "-i", "pipe:0",
                "-f", "mp3", "-codec:a", "libmp3lame", "-b:a", MP3_BITRATE, "-ac", "1",
                "pipe:1",
            ],
            input=wav_bytes,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=True,
        )
    except subprocess.CalledProcessError as e:
        raise RuntimeError(f"ffmpeg mp3 encode failed: {e.stderr.decode(errors='replace')}") from e
    return result.stdout


_pipeline = None


def get_pipeline():
    global _pipeline
    if _pipeline is None:
        import torch
        from kokoro import KPipeline

        device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"[kokoro-server] loading pipeline on device={device}")
        _pipeline = KPipeline(lang_code="a", device=device)
    return _pipeline


def synthesize(text: str) -> bytes:
    import soundfile as sf

    pipeline = get_pipeline()
    generator = pipeline(text, voice=VOICE, speed=SPEED)

    chunks = []
    for _, _, audio in generator:
        chunks.append(audio)

    if not chunks:
        raise RuntimeError("Kokoro produced no audio")

    full = np.concatenate(chunks)
    wav_buf = io.BytesIO()
    sf.write(wav_buf, full, 24000, format="WAV")
    return wav_to_mp3(wav_buf.getvalue())


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/tts":
            self.send_error(404)
            return

        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length)) if length > 0 else {}
        text = body.get("text", "").strip()

        if not text:
            self.send_error(400, "Missing 'text' field")
            return

        try:
            audio = synthesize(text)
        except Exception as e:
            self.send_error(500, str(e))
            return

        self.send_response(200)
        self.send_header("Content-Type", "audio/mpeg")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(audio)))
        self.end_headers()
        self.wfile.write(audio)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def log_message(self, format, *args):
        print(f"[kokoro-server] {args[0]}")


def main():
    print(f"Kokoro TTS server on http://localhost:{PORT}/tts (voice={VOICE})")
    server = HTTPServer(("127.0.0.1", PORT), Handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down.")
        server.server_close()


if __name__ == "__main__":
    main()

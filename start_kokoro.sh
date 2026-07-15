#!/bin/bash
# Start the Kokoro TTS server for ReHero narration.
# Creates its own venv on first run (self-contained — no dependency on any
# other project on your machine) and installs requirements-kokoro.txt into it.
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VENV_DIR="$SCRIPT_DIR/.venv-kokoro"

if [ ! -f "$VENV_DIR/bin/python" ]; then
  echo "Setting up Kokoro venv (first run only — this installs torch, so it takes a while)..."
  python3 -m venv "$VENV_DIR"
  "$VENV_DIR/bin/pip" install --upgrade pip
  "$VENV_DIR/bin/pip" install -r "$SCRIPT_DIR/requirements-kokoro.txt"
fi

echo "Starting Kokoro TTS server..."
exec "$VENV_DIR/bin/python" "$SCRIPT_DIR/kokoro_server.py"

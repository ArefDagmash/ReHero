#!/bin/bash
# Start the Kokoro TTS server for ReHero narration.
# Uses the existing venv from VoicetoSpeechwithMath.
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VENV_DIR="$SCRIPT_DIR/../VoicetoSpeechwithMath/venv"

if [ ! -f "$VENV_DIR/bin/python" ]; then
  echo "Error: venv not found at $VENV_DIR" >&2
  exit 1
fi

echo "Starting Kokoro TTS server..."
exec "$VENV_DIR/bin/python" "$SCRIPT_DIR/kokoro_server.py"

#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ -z "${HIGLASS_SERVER_DIR:-}" && -f "$SCRIPT_DIR/.env" ]]; then
  set -a
  source "$SCRIPT_DIR/.env"
  set +a
fi
HIGLASS_SERVER_DIR="${HIGLASS_SERVER_DIR:-$SCRIPT_DIR/../../higlass-server}"
[[ "$HIGLASS_SERVER_DIR" = /* ]] || HIGLASS_SERVER_DIR="$SCRIPT_DIR/$HIGLASS_SERVER_DIR"

if [[ ! -d "$HIGLASS_SERVER_DIR/.git" ]]; then
  git clone https://github.com/higlass/higlass-server.git "$HIGLASS_SERVER_DIR"
fi

cd "$HIGLASS_SERVER_DIR"
conda env create -f environment.yml -n higlass-server || conda env update -f environment.yml -n higlass-server
conda run -n higlass-server pip install "clodius==0.20.4"   # environment.yml's pin doesn't match dnavis-env's writer version; see spec-002 notes
conda run -n higlass-server python manage.py migrate

echo "higlass-server installed at $HIGLASS_SERVER_DIR. Run ./register-tilesets.sh then ./run-server.sh."

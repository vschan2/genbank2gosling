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

cd "$HIGLASS_SERVER_DIR"
conda run --no-capture-output -n higlass-server python manage.py runserver localhost:8989

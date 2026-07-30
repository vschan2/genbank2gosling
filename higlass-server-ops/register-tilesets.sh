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

BACTERIAL_DIR="$SCRIPT_DIR/../output/bacterial_cluster"
HG_DATA_DIR="$HIGLASS_SERVER_DIR/media/hg-data"

mkdir -p "$HG_DATA_DIR"
cd "$HIGLASS_SERVER_DIR"

for genome_dir in "$BACTERIAL_DIR"/*/; do
  genome="$(basename "$genome_dir")"
  h5_file="$genome_dir${genome}_multivec/${genome}.multires.h5"
  uid="${genome//./-}"   # tile IDs are dot-delimited server-side; a "." in the UID breaks tile lookups

  if [[ ! -f "$h5_file" ]]; then
    echo "WARNING: missing $h5_file, skipping $genome" >&2
    continue
  fi

  # Drop any prior registration for this uid so re-running is idempotent
  # (ingest_tileset always inserts; a repeat --uid hits the DB's unique
  # constraint otherwise). delete_tileset raises Tileset.DoesNotExist
  # when there's nothing to remove yet (the normal first-run case) —
  # suppress that expected failure.
  conda run -n higlass-server python manage.py delete_tileset --uuid "$uid" >/dev/null 2>&1 || true

  cp "$h5_file" "$HG_DATA_DIR/${uid}.multires.h5"
  conda run -n higlass-server python manage.py ingest_tileset \
    --filename "$HG_DATA_DIR/${uid}.multires.h5" \
    --filetype multivec \
    --datatype multivec \
    --uid "$uid"
  echo "Registered $genome as $uid"
done

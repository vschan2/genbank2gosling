"""Stage 5 — Prepare per-base sequence track data.

Method branches by genome size, since Gosling loads inline data client-side
with no automatic tiling:
- Mitogenomes (small): inline per-base JSON, <genome>_sequence.json.
- Bacteria (large): one-hot encode A/T/G/C -> clodius multivec pyramid ->
  static tile directory <genome>_multivec/. Requires WSL2/Linux (pysam).
"""

from __future__ import annotations

import json
from pathlib import Path

import h5py
import numpy as np

from clodius.multivec import create_multivec_multires

from stage1_parse import REPO_ROOT, ParsedGenome, parse_all

OUTPUT_DIR = REPO_ROOT / "output" / "intermediate"

BASES = "ATGC"
TILE_SIZE = 1024


def write_sequence_json(genome: ParsedGenome) -> Path:
    """Write <genome>_sequence.json: the full per-base sequence, inline."""
    out_dir = OUTPUT_DIR / genome.cluster
    out_dir.mkdir(parents=True, exist_ok=True)

    path = out_dir / f"{genome.source_file.stem}_sequence.json"
    seq = str(genome.record.seq).upper()
    path.write_text(json.dumps(list(seq)))
    return path


def one_hot_encode(seq: str) -> np.ndarray:
    """One-hot encode a sequence into an (length, 4) array of A/T/G/C indicator rows."""
    seq_bytes = np.frombuffer(seq.encode("ascii"), dtype=np.uint8)
    return np.stack([seq_bytes == ord(base) for base in BASES], axis=1).astype(np.float32)


def write_multivec(genome: ParsedGenome) -> Path:
    """Build a clodius multi-resolution multivec pyramid for one (large) genome.

    clodius.multivec.create_multivec_multires expects its array_data argument to be
    an open HDF5 file with one top-level dataset per chromosome, so the one-hot
    array is first written to a base-resolution HDF5 file before aggregating.
    """
    out_dir = OUTPUT_DIR / genome.cluster / f"{genome.source_file.stem}_multivec"
    out_dir.mkdir(parents=True, exist_ok=True)

    seq = str(genome.record.seq).upper()
    one_hot = one_hot_encode(seq)

    base_path = out_dir / "base.h5"
    with h5py.File(base_path, "w") as f:
        f.create_dataset(genome.accession, data=one_hot)

    multires_path = out_dir / f"{genome.source_file.stem}.multires.h5"
    with h5py.File(base_path, "r") as f_in:
        f_out = create_multivec_multires(
            f_in,
            chromsizes=[(genome.accession, genome.length)],
            agg=lambda x: np.nansum(x.T.reshape((x.shape[1], -1, 2)), axis=2).T,
            starting_resolution=1,
            tile_size=TILE_SIZE,
            output_file=str(multires_path),
            row_infos=[base.encode("ascii") for base in BASES],
        )
        f_out.close()

    base_path.unlink()
    return out_dir


def main() -> None:
    genomes, excluded = parse_all()

    for genome in genomes:
        if genome.cluster == "mitogenome":
            path = write_sequence_json(genome)
        else:
            path = write_multivec(genome)
        print(f"{genome.cluster:<12} {genome.source_file.stem} -> {path.relative_to(REPO_ROOT)}")

    if excluded:
        print(f"\nSkipped {len(excluded)} excluded file(s) (see Stage 1 output for reasons).")

    print(f"\nWrote sequence track data for {len(genomes)} genome(s).")


if __name__ == "__main__":
    main()

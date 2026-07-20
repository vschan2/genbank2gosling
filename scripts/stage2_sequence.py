"""Stage 2 — Extract sequence data: write a FASTA file + metadata record per genome."""

from __future__ import annotations

import json
from pathlib import Path

from Bio import SeqIO

from stage1_parse import REPO_ROOT, ParsedGenome, parse_all

OUTPUT_DIR = REPO_ROOT / "output" / "intermediate"


def write_sequence(genome: ParsedGenome) -> tuple[Path, Path]:
    """Write <genome>.fasta and <genome>_meta.json for one parsed genome."""
    out_dir = OUTPUT_DIR / genome.cluster
    out_dir.mkdir(parents=True, exist_ok=True)

    name = genome.source_file.stem
    fasta_path = out_dir / f"{name}.fasta"
    meta_path = out_dir / f"{name}_meta.json"

    SeqIO.write(genome.record, fasta_path, "fasta")

    meta = {
        "accession": genome.accession,
        "organism": genome.organism,
        "length": genome.length,
        "topology": genome.topology,
    }
    meta_path.write_text(json.dumps(meta, indent=2) + "\n")

    return fasta_path, meta_path


def main() -> None:
    genomes, excluded = parse_all()

    for genome in genomes:
        fasta_path, meta_path = write_sequence(genome)
        print(
            f"{genome.cluster:<12} {genome.source_file.stem} -> "
            f"{fasta_path.relative_to(REPO_ROOT)}, {meta_path.relative_to(REPO_ROOT)}"
        )

    if excluded:
        print(f"\nSkipped {len(excluded)} excluded file(s) (see Stage 1 output for reasons).")

    print(f"\nWrote sequence data for {len(genomes)} genome(s).")


if __name__ == "__main__":
    main()

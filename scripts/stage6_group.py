"""Stage 6 — Cluster grouping: group each genome's Stage 2-5 outputs into its
final cluster directory. Pure grouping step; does not recompute anything."""

from __future__ import annotations

import shutil
from pathlib import Path

from stage1_parse import REPO_ROOT, ParsedGenome, parse_all

INTERMEDIATE_DIR = REPO_ROOT / "output" / "intermediate"
CLUSTER_OUTPUT_DIRS = {
    "mitogenome": REPO_ROOT / "output" / "mitogenome_cluster",
    "bacteria": REPO_ROOT / "output" / "bacterial_cluster",
}


def genome_output_files(genome: ParsedGenome) -> list[Path]:
    """The set of Stage 2-5 output paths for one genome, in its intermediate dir."""
    name = genome.source_file.stem
    src_dir = INTERMEDIATE_DIR / genome.cluster

    files = [
        src_dir / f"{name}.fasta",
        src_dir / f"{name}_meta.json",
        src_dir / f"{name}_annotations.bed",
        src_dir / f"{name}_gc_skew.bedgraph",
    ]
    if genome.cluster == "mitogenome":
        files.append(src_dir / f"{name}_sequence.json")
    else:
        files.append(src_dir / f"{name}_multivec")
    return files


def group_genome(genome: ParsedGenome) -> Path:
    """Copy one genome's outputs into a per-genome subfolder of its cluster directory.

    Raises FileNotFoundError if an expected Stage 2-5 output is missing, since
    that means an earlier stage hasn't been run for this genome yet.
    """
    name = genome.source_file.stem
    dest_dir = CLUSTER_OUTPUT_DIRS[genome.cluster] / name
    dest_dir.mkdir(parents=True, exist_ok=True)

    for src in genome_output_files(genome):
        if not src.exists():
            raise FileNotFoundError(f"missing expected Stage 2-5 output: {src.relative_to(REPO_ROOT)}")
        dest = dest_dir / src.name
        if src.is_dir():
            shutil.copytree(src, dest, dirs_exist_ok=True)
        else:
            shutil.copy2(src, dest)

    return dest_dir


def main() -> None:
    genomes, excluded = parse_all()

    for genome in genomes:
        dest_dir = group_genome(genome)
        print(f"{genome.cluster:<12} {genome.source_file.stem} -> {dest_dir.relative_to(REPO_ROOT)}")

    if excluded:
        print(f"\nSkipped {len(excluded)} excluded file(s) (see Stage 1 output for reasons).")

    print(f"\nGrouped {len(genomes)} genome(s) into their cluster directories.")


if __name__ == "__main__":
    main()

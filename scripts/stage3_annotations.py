"""Stage 3 — Extract gene-level annotations from parsed GenBank records."""

from __future__ import annotations

from pathlib import Path

from Bio.SeqFeature import SeqFeature

from stage1_parse import REPO_ROOT, ParsedGenome, parse_all

OUTPUT_DIR = REPO_ROOT / "output" / "intermediate"

KEPT_TYPES = {
    "gene",
    "CDS",
    "tRNA",
    "rRNA",
    "D-loop",
    "misc_feature",
    "ncRNA",
    "tmRNA",
    "regulatory",
    "repeat_region",
}

STRAND_SYMBOLS = {1: "+", -1: "-", None: "."}


def feature_name(feature: SeqFeature) -> str:
    """Resolve a feature's display name: gene -> product -> locus_tag."""
    for key in ("gene", "product", "locus_tag"):
        values = feature.qualifiers.get(key)
        if values:
            return values[0]
    return feature.type


def write_annotations(genome: ParsedGenome) -> tuple[Path, int]:
    """Write <genome>_annotations.bed for one parsed genome. Returns (path, row count)."""
    out_dir = OUTPUT_DIR / genome.cluster
    out_dir.mkdir(parents=True, exist_ok=True)

    bed_path = out_dir / f"{genome.source_file.stem}_annotations.bed"

    rows = []
    for feature in genome.record.features:
        if feature.type not in KEPT_TYPES:
            continue
        start = int(feature.location.start)
        end = int(feature.location.end)
        strand = STRAND_SYMBOLS.get(feature.location.strand, ".")
        name = feature_name(feature)
        rows.append(f"{genome.accession}\t{start}\t{end}\t{name}\t0\t{strand}\t{feature.type}")

    bed_path.write_text("\n".join(rows) + ("\n" if rows else ""))
    return bed_path, len(rows)


def main() -> None:
    genomes, excluded = parse_all()

    for genome in genomes:
        bed_path, count = write_annotations(genome)
        print(f"{genome.cluster:<12} {genome.source_file.stem} -> {bed_path.relative_to(REPO_ROOT)} ({count} features)")

    if excluded:
        print(f"\nSkipped {len(excluded)} excluded file(s) (see Stage 1 output for reasons).")

    print(f"\nWrote annotations for {len(genomes)} genome(s).")


if __name__ == "__main__":
    main()

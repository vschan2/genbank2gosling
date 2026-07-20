"""Stage 1 — Parse GenBank records and validate each is a single, complete, circular contig."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from Bio import SeqIO
from Bio.SeqRecord import SeqRecord

REPO_ROOT = Path(__file__).resolve().parent.parent
INPUT_DIRS = {
    "mitogenome": REPO_ROOT / "input" / "mitogenomes",
    "bacteria": REPO_ROOT / "input" / "bacteria",
}


@dataclass
class ParsedGenome:
    source_file: Path
    cluster: str
    accession: str
    organism: str
    length: int
    topology: str
    record: SeqRecord


@dataclass
class ExcludedFile:
    source_file: Path
    cluster: str
    reason: str


def parse_genbank_file(path: Path, cluster: str) -> tuple[ParsedGenome | None, ExcludedFile | None]:
    """Parse one .gb file. Returns (genome, None) or (None, exclusion) if it fails
    the single-complete-circular-contig requirement."""
    records = list(SeqIO.parse(path, "genbank"))

    if len(records) != 1:
        reason = f"expected 1 record, found {len(records)} (draft/multi-contig assembly)"
        return None, ExcludedFile(path, cluster, reason)

    record = records[0]
    topology = record.annotations.get("topology", "").lower()

    if topology != "circular":
        reason = f"topology is {topology or 'unknown'!r}, not circular (draft/incomplete assemblies are out of scope)"
        return None, ExcludedFile(path, cluster, reason)

    genome = ParsedGenome(
        source_file=path,
        cluster=cluster,
        accession=record.id,
        organism=record.annotations.get("organism", record.description),
        length=len(record.seq),
        topology=topology,
        record=record,
    )
    return genome, None


def parse_cluster(cluster: str) -> tuple[list[ParsedGenome], list[ExcludedFile]]:
    """Parse every .gb file in a cluster's input directory."""
    genomes: list[ParsedGenome] = []
    excluded: list[ExcludedFile] = []

    for path in sorted(INPUT_DIRS[cluster].glob("*.gb")):
        genome, exclusion = parse_genbank_file(path, cluster)
        if genome is not None:
            genomes.append(genome)
        else:
            excluded.append(exclusion)

    return genomes, excluded


def parse_all() -> tuple[list[ParsedGenome], list[ExcludedFile]]:
    """Parse both clusters' input directories, kept separate throughout."""
    genomes: list[ParsedGenome] = []
    excluded: list[ExcludedFile] = []

    for cluster in INPUT_DIRS:
        cluster_genomes, cluster_excluded = parse_cluster(cluster)
        genomes.extend(cluster_genomes)
        excluded.extend(cluster_excluded)

    return genomes, excluded


def main() -> None:
    genomes, excluded = parse_all()

    print(f"{'cluster':<12} {'accession':<12} {'length':>10} {'topology':<10} organism")
    for g in genomes:
        print(f"{g.cluster:<12} {g.accession:<12} {g.length:>10} {g.topology:<10} {g.organism}")

    if excluded:
        print(f"\nExcluded {len(excluded)} file(s):")
        for e in excluded:
            print(f"  {e.source_file.name} [{e.cluster}]: {e.reason}")

    print(f"\nParsed {len(genomes)} genome(s), excluded {len(excluded)}.")


if __name__ == "__main__":
    main()

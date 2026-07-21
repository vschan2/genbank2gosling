"""Stage 4 — Compute GC skew: sliding-window and cumulative, auto-scaled to genome length."""

from __future__ import annotations

from pathlib import Path

import numpy as np

from stage1_parse import REPO_ROOT, ParsedGenome, parse_all

OUTPUT_DIR = REPO_ROOT / "output" / "intermediate"


def gc_skew_windows(genome: ParsedGenome) -> list[tuple[int, int, float, int]]:
    """Compute (start, end, gc_skew, cumulative_gc_skew) for sliding windows across the genome.

    Windowed skew is the local (G-C)/(G+C) ratio. Cumulative skew is the running
    sum of (G-C) counts from the start of the sequence, independent of the
    window/step overlap, which is what makes it useful for spotting the
    origin/terminus inflection points in bacterial chromosomes.
    """
    seq = str(genome.record.seq).upper()
    length = genome.length

    seq_bytes = np.frombuffer(seq.encode("ascii"), dtype=np.uint8)
    is_g = seq_bytes == ord("G")
    is_c = seq_bytes == ord("C")
    running_diff = np.cumsum(is_g.astype(np.int64) - is_c.astype(np.int64))

    window = max(1, round(length / 1000))
    step = max(1, round(window / 5))

    rows = []
    for start in range(0, length, step):
        end = min(start + window, length)
        g = int(is_g[start:end].sum())
        c = int(is_c[start:end].sum())
        skew = (g - c) / (g + c) if (g + c) > 0 else 0.0
        cumulative = int(running_diff[end - 1])
        rows.append((start, end, skew, cumulative))

    return rows


def write_gc_skew(genome: ParsedGenome) -> tuple[Path, int]:
    """Write <genome>_gc_skew.bedgraph for one parsed genome. Returns (path, row count)."""
    out_dir = OUTPUT_DIR / genome.cluster
    out_dir.mkdir(parents=True, exist_ok=True)

    bedgraph_path = out_dir / f"{genome.source_file.stem}_gc_skew.bedgraph"

    rows = gc_skew_windows(genome)
    lines = [
        f"{genome.accession}\t{start}\t{end}\t{skew:.6f}\t{cumulative}"
        for start, end, skew, cumulative in rows
    ]
    bedgraph_path.write_text("\n".join(lines) + ("\n" if lines else ""))
    return bedgraph_path, len(rows)


def main() -> None:
    genomes, excluded = parse_all()

    for genome in genomes:
        bedgraph_path, count = write_gc_skew(genome)
        print(
            f"{genome.cluster:<12} {genome.source_file.stem} -> "
            f"{bedgraph_path.relative_to(REPO_ROOT)} ({count} windows)"
        )

    if excluded:
        print(f"\nSkipped {len(excluded)} excluded file(s) (see Stage 1 output for reasons).")

    print(f"\nWrote GC skew data for {len(genomes)} genome(s).")


if __name__ == "__main__":
    main()

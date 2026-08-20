"""Stage 4 — Compute GC skew and GC content: sliding-window and cumulative.

Window/step sizes are read from gc_skew_config.json, keyed by cluster. A cluster
without an explicit entry falls back to the config's "default" auto-scale formula
(window derived from genome length), so future clusters work without code changes.

All genomes are circular, so windows wrap around the sequence boundary instead
of truncating near the end (see gc_skew_windows).
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from stage1_parse import REPO_ROOT, ParsedGenome, parse_all

OUTPUT_DIR = REPO_ROOT / "output" / "intermediate"
CONFIG = json.loads((Path(__file__).parent / "gc_skew_config.json").read_text())


def resolve_window_step(cluster: str, length: int) -> tuple[int, int]:
    """Look up (window, step) for a cluster, falling back to the length-based default."""
    override = CONFIG["clusters"].get(cluster)
    if override is not None:
        return override["window"], override["step"]

    default = CONFIG["default"]
    window = max(1, round(length / default["window_divisor"]))
    step = max(1, round(window / default["step_divisor"]))
    return window, step


def gc_skew_windows(genome: ParsedGenome) -> list[tuple[int, int, float, int, float]]:
    """Compute (start, end, gc_skew, cumulative_gc_skew, gc_content) for sliding windows.

    Windowed skew is the local (G-C)/(G+C) ratio. Cumulative skew is the running
    sum of (G-C) counts from the start of the sequence, independent of the
    window/step overlap, which is what makes it useful for spotting the
    origin/terminus inflection points in bacterial chromosomes. GC content is the
    windowed (G+C)/window-length fraction.

    Every genome reaching this stage is circular (Stage 1 excludes anything
    else), so a window running past the sequence end wraps onto the start
    instead of truncating: its G/C counts are pulled from `[start:length]` plus
    the wrapped remainder `[0:wrap]`, keeping the window full-length rather than
    shrinking near the boundary. The reported `end` coordinate stays capped at
    `length` regardless, since Gosling's genomic coordinate space is bounded by
    the declared chromosome length.
    """
    seq = str(genome.record.seq).upper()
    length = genome.length
    circular = genome.topology == "circular"

    seq_bytes = np.frombuffer(seq.encode("ascii"), dtype=np.uint8)
    is_g = seq_bytes == ord("G")
    is_c = seq_bytes == ord("C")
    running_diff = np.cumsum(is_g.astype(np.int64) - is_c.astype(np.int64))

    window, step = resolve_window_step(genome.cluster, length)

    rows = []
    for start in range(0, length, step):
        raw_end = start + window
        end = min(raw_end, length)

        if circular and raw_end > length:
            wrap = raw_end - length
            g = int(is_g[start:length].sum()) + int(is_g[0:wrap].sum())
            c = int(is_c[start:length].sum()) + int(is_c[0:wrap].sum())
            window_len = window
        else:
            g = int(is_g[start:end].sum())
            c = int(is_c[start:end].sum())
            window_len = end - start

        skew = (g - c) / (g + c) if (g + c) > 0 else 0.0
        cumulative = int(running_diff[end - 1])
        gc_content = (g + c) / window_len if window_len > 0 else 0.0
        rows.append((start, end, skew, cumulative, gc_content))

    return rows


def write_gc_skew(genome: ParsedGenome) -> tuple[Path, int]:
    """Write <genome>_gc_skew.bedgraph for one parsed genome. Returns (path, row count)."""
    out_dir = OUTPUT_DIR / genome.cluster
    out_dir.mkdir(parents=True, exist_ok=True)

    bedgraph_path = out_dir / f"{genome.source_file.stem}_gc_skew.bedgraph"

    rows = gc_skew_windows(genome)
    lines = [
        f"{genome.accession}\t{start}\t{end}\t{skew:.6f}\t{cumulative}\t{gc_content:.6f}"
        for start, end, skew, cumulative, gc_content in rows
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

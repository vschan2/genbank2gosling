# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

This repo is spec-first: `README.md` is the authoritative design doc, and `scripts/stage1_parse.py` through `scripts/stage6_assemble.py` are currently empty stubs. When implementing a stage, treat that doc's "Pipeline Stages" and "Output File Summary" sections as the spec, not something to redesign. Implement one stage at a time rather than the whole pipeline in one pass — it's easier to review and correct.

`GenBank_Pipeline_Setup_Checklist.md` records the environment setup decisions already made (see below); don't re-litigate them unless the user asks.

## What this pipeline does

Converts raw GenBank records into derived datasets for Gosling.js comparative genome visualization. Each genome flows through: parse → extract sequence → extract annotations → compute GC skew → prepare a per-base sequence track → group into a cluster. Two genome clusters are compared independently and are **never mixed**:

- `input/mitogenomes/` — small circular mitochondrial genomes (~15–20 kb)
- `input/bacteria/` — large circular bacterial chromosomes (~1–10 Mb)

Draft/contig-level assemblies (multiple unordered scaffolds) are out of scope — every genome entering the pipeline must be a single complete, contiguous, circular record. `input/bacteria/` currently holds only complete-genome `.gb` files; a `.gbff` draft (`C_alimapuense`, 12 contigs) was intentionally excluded and is not present.

## Environment

Python work happens inside the WSL2 `dnavis-env` conda environment (not native Windows), because Stage 5's bacterial branch depends on `clodius`/`pysam`, which have no native Windows support.

```bash
conda activate dnavis-env
```

Key packages in that env: `biopython` (GenBank parsing, stages 1–3), `pandas`/`numpy` (tabular + sliding-window math, stages 3–4), `clodius` (multivec tiling, stage 5 bacterial branch only — Linux/WSL2 only, will not run natively on Windows).

There is no requirements.txt/environment.yml/pyproject.toml in the repo yet — the env was built manually per the checklist doc. If you add or change dependencies, keep that doc's Phase 2/3 steps in sync.

Run stage scripts from the repo root, e.g.:
```bash
conda activate dnavis-env
python scripts/stage1_parse.py
```
(No CLI argument parsing, test suite, or lint config exists yet — there's nothing to run beyond executing the stage scripts directly. Add these when the scripts have real content.)

## Pipeline architecture

Each stage takes the previous stage's output as input; stages 2–5 all ultimately derive from the parsed record produced by Stage 1.

1. **Parse** (`stage1_parse.py`) — `Bio.SeqIO.parse(..., "genbank")`. Capture accession, organism, length, topology (from `LOCUS`). Flag/exclude non-single-complete-contig records.
2. **Sequence** (`stage2_sequence.py`) — write `<genome>.fasta` + `<genome>_meta.json` (length, topology, accession). Feeds both Stage 4 and Stage 5.
3. **Annotations** (`stage3_annotations.py`) — walk `record.features`, keep gene-level/functional types (`gene`, `CDS`, `tRNA`, `rRNA`, `D-loop`, `misc_feature`, `ncRNA`, `tmRNA`, `regulatory`, ...). Name resolution order: `gene` → `product` → `locus_tag`. Write `<genome>_annotations.bed`.
4. **GC skew** (`stage4_gc_skew.py`) — sliding-window `(G−C)/(G+C)` plus cumulative skew. Window/step are **auto-scaled to genome length**, not fixed: `window ≈ length/1000`, `step ≈ window/5`. This matters because mitogenomes and bacterial chromosomes differ by ~2 orders of magnitude in length. Write `<genome>_gc_skew.bedgraph`.
5. **Sequence track** (`stage5_sequence_track.py`) — method branches by genome size, since Gosling loads inline data client-side with no automatic tiling:
   - Mitogenomes (small): inline per-base JSON, `<genome>_sequence.json`. Runs anywhere.
   - Bacteria (large): one-hot encode A/T/G/C → `clodius` multi-resolution multivec pyramid → static tile directory `<genome>_multivec/`. **Must run in WSL2/Linux** (pysam dependency).
6. **Cluster assembly** (`stage6_assemble.py`) — group each genome's four outputs (FASTA/meta, annotations BED, GC-skew BedGraph, sequence track) into `output/mitogenome_cluster/` or `output/bacterial_cluster/`. Pure grouping step — keep the two clusters' intermediate outputs separate from earlier stages so this doesn't turn into cleanup.

Downstream (not part of this pipeline, but shapes what the outputs need to support): each cluster becomes a Gosling.js multi-view stack, one row-group per genome, with a shared `linkingId` on the `x` channel across all row-groups in a cluster so pan/zoom stays synchronized on absolute base-pair position. Homology/synteny linking across genomes is a deferred future extension — don't scope it into stage implementations now.

## Conventions

- One output file set per genome, namespaced `<genome>_*`; see the Output File Summary table in `README.md` for exact filenames/formats.
- Keep mitogenome-cluster and bacterial-cluster inputs/outputs in separate directories end-to-end; Stage 6 should only need to group already-separated files, not filter/sort them.

## Git

`input/` (raw GenBank source files) and `output/*` (regenerated by the pipeline) are gitignored — treated as externally-sourced or generated data, not committed. 

# GenBank Preprocessing Pipeline for Gosling.js Comparative Visualization

A preprocessing pipeline that converts raw GenBank records into the derived datasets needed to build linked, multi-view [Gosling.js](https://gosling.js.org/) visualizations for comparative genomics. For each genome it extracts three data layers — **sequence**, **annotations**, and **GC skew** — and prepares them in the format each visualization scale requires (inline JSON/CSV for small genomes, tiled multivec pyramids for large ones).

The design targets two independent comparison contexts ("clusters"). Genomes *within* a cluster are compared against each other in one linked multi-view chart; the two clusters themselves are entirely separate outputs — never combined into a single chart, like two separate figures, for instance:

| Cluster | Genome type | Typical size | Topology |
|---|---|---|---|
| Mitogenome cluster | Mitochondrial genomes (Lepidoptera) | ~15–20 kb | circular |
| Bacterial cluster | Complete bacterial chromosomes (*Corynebacterium*) | ~1–4 Mb | circular |

Draft/contig-level assemblies (multiple unordered scaffolds) are explicitly **out of scope** — each genome must be a single complete, contiguous record before entering the pipeline.

## Status

Design is finalized; implementation has not started. `scripts/stage1_parse.py` through `scripts/stage6_assemble.py` are empty stubs — see [Pipeline Stages](#pipeline-stages) below for the spec each one implements.

## Repository layout

```
genbank-pipeline/
├── input/
│   ├── mitogenomes/        # mitogenome cluster source .gb files
│   └── bacteria/           # bacterial cluster source .gb files
├── output/
│   ├── mitogenome_cluster/ # Stage 6 output, grouped per genome
│   └── bacterial_cluster/  # Stage 6 output, grouped per genome
├── scripts/
│   ├── stage1_parse.py
│   ├── stage2_sequence.py
│   ├── stage3_annotations.py
│   ├── stage4_gc_skew.py
│   ├── stage5_sequence_track.py
│   └── stage6_assemble.py
├── CLAUDE.md                             # guidance for Claude Code
└── GenBank_Pipeline_Setup_Checklist.md   # environment setup walkthrough (Windows/WSL2)
```

`input/` and `output/` are gitignored (source data is external; outputs are regenerated), so a fresh clone will have empty `input/mitogenomes/` and `input/bacteria/` directories — populate them with your own complete-genome `.gb` files before running the pipeline.

## Setup

The pipeline runs inside a WSL2 `dnavis-env` conda environment (not native Windows), because Stage 5's bacterial branch depends on `clodius`/`pysam`, which have no native Windows support. See `GenBank_Pipeline_Setup_Checklist.md` for the full Windows/WSL2 install walkthrough.

```bash
conda activate dnavis-env
```

Key packages: `biopython` (GenBank parsing), `pandas`/`numpy` (tabular + sliding-window math), `clodius` (multivec tiling, bacterial branch only — Linux/WSL2 only).

## Usage

Once implemented, each stage runs as a standalone script from the repo root:

```bash
conda activate dnavis-env
python scripts/stage1_parse.py
python scripts/stage2_sequence.py
python scripts/stage3_annotations.py
python scripts/stage4_gc_skew.py
python scripts/stage5_sequence_track.py
python scripts/stage6_assemble.py
```

Stage 5's bacterial (`clodius`) branch must run in WSL2/Linux.

## Input Data

Source genomes currently in `input/` (all complete, single-contig, circular):

**Mitogenome cluster** (`input/mitogenomes/`, Lepidoptera):

| File | Organism | Length |
|---|---|---|
| `B.exclamationis_MtDNA_MZ502489.gb` | *Badamia exclamationis* | 15,289 bp |
| `H.schoenherr_MtDNA_MZ502493.gb` | *Hasora schoenherr* | 15,340 bp |
| `H.schoenherr_MtDNA_PQ149492.gb` | *Hasora schoenherr* (isolate S2) | 15,353 bp |
| `H.vitta_MtDNA_KR076553.gb` | *Hasora vitta* | 15,282 bp |
| `H.vitta_MtDNA_PP789054.gb` | *Hasora vitta* (isolate S14) | 15,289 bp |
| `M.conifera_MtDNA_MT852025.gb` | *Macrosoma conifera* | 15,344 bp |
| `O.maga_MtDNA_MW288059.gb` | *Onryza maga* | 15,381 bp |
| `P.helenus_MtDNA_KM244656.gb` | *Papilio helenus* | 15,349 bp |

**Bacterial cluster** (`input/bacteria/`, *Corynebacterium*):

| File | Organism | Length |
|---|---|---|
| `C.callunae_DSC_20147_CP004354.gb` | *C. callunae* DSM 20147 | 2,839,551 bp |
| `C.diphtheriae_PRJEB24256.gb` | *C. diphtheriae* CHUV2995 | 3,060,363 bp |
| `C.humireducens_DSM_45392_CP005286.gb` | *C. humireducens* DSM 45392 | 2,681,312 bp |
| `C.kutscheri_DSM_20755_CP011312.gb` | *C. kutscheri* DSM 20755 | 2,354,065 bp |
| `C.marinum_DSM_44953_CP007790.gb` | *C. marinum* DSM 44953 | 2,607,268 bp |
| `C.mustelae_DSM_45274_CP011542.gb` | *C. mustelae* DSM 45274 | 3,391,554 bp |
| `C.testudinoris_DSM_44614_CP011545.gb` | *C. testudinoris* DSM 44614 | 2,721,226 bp |

## Pipeline Stages

### Stage 1 — Parse GenBank record(s)
- Tool: Biopython `SeqIO.parse(..., "genbank")`
- For each record, capture: accession, organism, molecule length, topology (`circular`/`linear`, from the `LOCUS` line), and the full nucleotide sequence.
- Records failing the "single complete contig" requirement are flagged and excluded from downstream steps.

### Stage 2 — Extract sequence (basepair) data
- Output: FASTA file per genome + a small metadata record (`length`, `topology`, `accession`).
- This sequence is the source for two downstream products:
  - The per-base **sequence track** (Stage 5)
  - The **GC skew** calculation (Stage 4)

### Stage 3 — Extract annotations
- Walk `record.features`, keep gene-level and functional features (`gene`, `CDS`, `tRNA`, `rRNA`, `D-loop`, `misc_feature`, `ncRNA`, `tmRNA`, `regulatory`, etc. depending on what the GenBank record contains).
- Fields captured per feature: `start`, `end`, `strand`, `type`, `name` (from `gene`/`product`/`locus_tag` qualifiers, in that preference order).
- Output: BED/CSV, one row per feature, one file per genome.

### Stage 4 — Compute GC skew
- Formula: `GC skew = (G − C) / (G + C)` over a sliding window; cumulative GC skew is also computed (useful for identifying origin/terminus regions in bacterial chromosomes).
- **Window and step size are auto-scaled to genome length** rather than fixed, since mitogenomes (~15 kb) and bacterial chromosomes (~1–4 Mb) differ by ~2 orders of magnitude:
  - `window ≈ length / 1000`
  - `step ≈ window / 5`
- Output: BedGraph/CSV (`chrom, start, end, gc_skew, cumulative_gc_skew`).

### Stage 5 — Prepare per-base sequence track data
The method depends on genome size, since Gosling loads inline data client-side without automatic tiling:

| Genome scale | Method | Rationale |
|---|---|---|
| Small (mitogenomes, tens of kb) | Inline JSON/CSV, one row per base; letters rendered via a `text` mark gated by a zoom-level `visibility` rule | Small enough to load entirely in-browser; no tiling infrastructure needed |
| Large (bacterial chromosomes, Mb-scale) | Multivec tile pyramid, generated offline via `clodius` (HiGlass's tiling CLI), served as static tiles | A flat per-base table (millions of rows) is too large to load/parse as one inline block; tiling lets the viewer fetch only the visible window at the current zoom level |

Multivec construction (bacterial genomes only):
1. One-hot encode the sequence into four rows (A/T/G/C).
2. Aggregate into a multi-resolution pyramid with `clodius` (same tiling concept used for BigWig tracks).
3. Export as a static tile directory (no persistent tile server required — just static file hosting).

### Stage 6 — Cluster assembly
- Each genome's outputs (FASTA/length, annotation BED/CSV, GC skew BedGraph/CSV, + sequence track data) are grouped per cluster into `output/mitogenome_cluster/` or `output/bacterial_cluster/`.
- Clusters are never mixed in a single chart.

## Gosling.js View Design (downstream of this pipeline)

- Each cluster is rendered as its own **multi-view stack**: one row-group per genome, each row-group containing an annotation track, a GC skew track, and a semantic-zoom-gated sequence track. This produces one independent chart per cluster (e.g. one chart for the Lepidoptera mitogenomes, a separate chart for the *Corynebacterium* genomes) — the two are never combined into a single view.
- All row-groups *within* a cluster's chart share a single `linkingId` on their `x` channel, so pan/zoom is **fully synchronized**: same absolute base-pair start position and same window width across every genome in that cluster simultaneously. If a window extends past a shorter genome's end, that track simply shows empty space beyond its boundary.
- Homology/synteny-linked comparison (connecting orthologous regions across genomes with ribbons/arcs) is a planned future extension and is **not** part of the current pipeline. It will require an additional alignment/ortholog-mapping step (e.g. MUMmer/nucmer, or shared locus-tag matching) not yet implemented.

## Output File Summary (per genome)

| File | Format | Content |
|---|---|---|
| `<genome>.fasta` | FASTA | Raw nucleotide sequence |
| `<genome>_meta.json` | JSON | Length, topology, accession, organism |
| `<genome>_annotations.bed` | BED/CSV | Gene/feature intervals with strand, type, name |
| `<genome>_gc_skew.bedgraph` | BedGraph/CSV | Windowed and cumulative GC skew |
| `<genome>_sequence.json` (mitogenomes) | JSON | Per-base sequence, inline |
| `<genome>_multivec/` (bacteria) | Static tile directory | Multi-resolution per-base pyramid |

## Open Items

- Implement Stages 1–6 (see [Status](#status)).
- Homology/synteny linking (cross-genome comparison) — design deferred to a later phase of the project.
- **(Optional)** Stage 4's windowed GC skew currently truncates the final sliding window at the end of the sequence rather than wrapping around, even though all genomes in this pipeline are circular. SkewIT ("The Skew Index Test for large-scale GC Skew analysis of bacterial genomes, Lu & Salzberg, 2020) handles this by appending the first `L/2` bases of the sequence onto its end before windowing, so boundary windows are full-length instead of shrinking. The cumulative GC skew column doesn't need this treatment — per "Analyzing genomes with cumulative skew diagrams," (Grigoriev, 1998) cumulative skew is a single running pass over the sequence and has no windowing edge case to handle.

# GenBank Preprocessing Pipeline - Installation & Implementation Checklist
### Windows 11 / PowerShell / Claude Code

---

## 0. Key decision up front: Windows-native vs. WSL2

Most of this pipeline runs fine natively on Windows in PowerShell. **One stage does not:**

> **Stage 5 (bacterial multivec tiling) uses `clodius`, which depends on `pysam`. `pysam` has no native Windows support** (it wraps `htslib`/`samtools`, which are Linux/macOS-only C libraries). This has been an open limitation for years and isn't something a pip flag fixes.

So the plan below is a **hybrid setup**:

- **Native Windows (PowerShell):** Claude Code, Git, project files, Stages 1–4 and 6, and the small-genome (mitogenome) branch of Stage 5.
- **WSL2 (Ubuntu + conda/bioconda):** only the bacterial branch of Stage 5 (`clodius` tiling). You can also just run the *entire* Python pipeline inside WSL2 if you'd rather have one environment. See the note in Phase 2.

Decide now: **(A)** native Windows for everything except clodius, which drops into WSL2 only when needed, or **(B)** do all Python work inside WSL2 from the start (simpler long-term, avoids path-translation friction). Recommendation: **(B)** if you're comfortable with a Linux shell; **(A)** if you want to stay in PowerShell as much as possible. **Decision: (B)**

---

## Phase 1 - Core tooling (native Windows, PowerShell)

[ ] Confirm Windows 11 build is current (`winver`)
[ ] Install **Git for Windows**: https://git-scm.com/downloads/win
  - This is what gives Claude Code its Bash tool on native Windows; without it, Claude Code falls back to PowerShell-only tool execution.
[ ] Install **Claude Code** (native installer, no Node.js required):
  ```powershell
  irm https://claude.ai/install.ps1 | iex
  ```
  - Run from a normal (non-admin) PowerShell window.
  - Close and reopen PowerShell afterward so PATH updates take effect.
  - Verify: `claude --version`
  - If `claude` isn't recognized, PATH wasn't picked up. Reopen the terminal. If it persists, run `claude doctor` (if reachable) or check `%USERPROFILE%\.local\bin` is on PATH.
[ ] Authenticate: run `claude` in a project folder → it opens a browser for OAuth login (needs Claude Pro/Max/Team/Enterprise; the free plan doesn't include Claude Code).

---

## Phase 2 - WSL2 (for `clodius` / bacterial tiling)

[x] Install WSL2 + Ubuntu:
  ```powershell
  wsl --install
  ```
  (restart if prompted; Ubuntu becomes the default distro)
[x] Open the Ubuntu terminal (via Windows Terminal) and update packages:
  ```bash
  sudo apt update && sudo apt upgrade -y
  ```
[x] Install **Miniconda** inside WSL2 (bioconda packages like `clodius` are Linux-targeted and this is by far the least painful install path):
  ```bash
  wget https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh -O ~/miniconda.sh
  bash ~/miniconda.sh -b -p ~/miniconda3
  ~/miniconda3/bin/conda init bash
  ```
  (close/reopen the Ubuntu terminal after this)
[x] Create a dedicated environment and add channels:
  ```bash
  conda create -n dnavis-env python=3.10 -y
  conda activate dnavis-env
  conda config --add channels bioconda
  conda config --add channels conda-forge
  conda config --set channel_priority strict
  conda install clodius biopython pandas numpy pysam -y
  ```
[x] `clodius` is not published on bioconda. Install it via `pip` instead, after the conda packages are in place (pip-after-conda, not the other way around, avoids environment resolver conflicts):
  ```bash
  pip install clodius
  ```
[x] Sanity check that the conda-installed and pip-installed packages play nicely together:
  ```bash
  python -c "import pysam, numpy, pandas, Bio; print('all good')"
  ```
[x] Verify: `clodius --help`
[ ] (Optional) **Claude Code inside WSL2 too**, if you go with option (B) above, run the same native install command from inside the Ubuntu shell (it detects the Linux environment and installs a Linux binary, separate from the Windows one). Keep in mind: Git config, and Claude Code's login/session, are separate between the Windows-side and WSL-side installs.
[x] Decide how your project folder is accessed from both sides:
  - Easiest: keep the project **inside the WSL2 filesystem** (e.g. `~/projects/dnavis-env`) and edit it via Claude Code running in WSL2 directly, or via VS Code's "Remote - WSL" extension. Native-Windows-side tools reach it at `\\wsl$\Ubuntu\home\<user>\projects\dnavis-env` if needed.
  - Avoid keeping the working project on the Windows filesystem (`/mnt/c/...`) and doing heavy I/O from inside WSL2. It's noticeably slower.
  - **Decision:** Keep inside WSL2 filesystem and edit via VS Code's "Remote - WSL" extension using Claude Code.

---

## Phase 3 - Python environment & packages (whichever side you run Python on)

[x] `biopython`: GenBank parsing (Stage 1–3)
[x] `pandas`: tabular BED/CSV/BedGraph handling (Stages 3–4)
[x] `numpy`: GC skew sliding-window math (Stage 4)
[x] `clodius`: multivec tiling, **WSL2/Linux only** (Stage 5, bacterial branch)
[ ] If staying native-Windows for Stages 1–4/6: install Python 3.10+ (via `winget install Python.Python.3.12` or python.org) and `pip install biopython pandas numpy` in a venv.

---

## Phase 4 - Project scaffolding

[x] Create project structure, e.g.:
  ```
  genbank-pipeline/
  ├── input/
  │   ├── mitogenomes/        # .gb files
  │   └── bacteria/           # .gb / .gbff files
  ├── output/
  │   ├── mitogenome_cluster/
  │   └── bacterial_cluster/
  ├── scripts/
  │   ├── stage1_parse.py
  │   ├── stage2_sequence.py
  │   ├── stage3_annotations.py
  │   ├── stage4_gc_skew.py
  │   ├── stage5_sequence_track.py
  │   └── stage6_group.py
  └── CLAUDE.md
  ```
[x] Move/confirm input files: `H_schoenherr_MtDNA_PQ149492.gb`, `C_humireducens_DSM_45392_CP005286.gb` in place. **Note:** `C_alimapuense_VA37-3_PGAP.gbff` is a 12-contig draft and is explicitly out of scope. Don't wire it into the pipeline until it's replaced with a complete genome (see Open Items below).
[x] Write a short `CLAUDE.md` in the project root summarizing the pipeline stages and conventions (file naming, cluster definitions, the Windows/WSL split) so Claude Code has persistent project context across sessions.

---

## Phase 5 - Implementation checklist (mirrors the pipeline stages)

[x] **Stage 1 - Parse:** `SeqIO.parse(..., "genbank")`; capture accession, organism, length, topology from `LOCUS`; flag/exclude any record that isn't a single complete contig.
[x] **Stage 2 - Sequence extraction:** write `<genome>.fasta` + `<genome>_meta.json` (length, topology, accession).
[x] **Stage 3 - Annotations:** walk `record.features`, filter to gene-level/functional types, extract `start/end/strand/type/name` (name preference: `gene` → `product` → `locus_tag`); write `<genome>_annotations.bed`.
[x] **Stage 4 - GC skew:** implement sliding-window `(G−C)/(G+C)` + cumulative skew, with `window ≈ length/1000`, `step ≈ window/5` (auto-scaled per genome, not fixed); write `<genome>_gc_skew.bedgraph`.
[x] **Stage 5 - Sequence track (branches by genome size):**
  - Mitogenomes: inline per-base JSON/CSV → `<genome>_sequence.json` (native Windows or WSL, no clodius needed).
  - Bacteria: one-hot encode A/T/G/C → `clodius` multi-resolution pyramid → static tile directory `<genome>_multivec/` (**must run in WSL2/Linux**).
[x] **Stage 6 - Cluster grouping:** group each genome's four outputs (FASTA/meta, annotations, GC skew, sequence track) per cluster; keep mitogenome and bacterial clusters separate. Never mixed in one chart.
[x] Spot-check outputs against Section 5's file summary table in the source doc (one FASTA, one meta JSON, one annotation BED, one GC-skew BedGraph, and one sequence-track output per genome).

---

## Phase 6 - Open items from the source document (resolve before/alongside implementation)

[ ] Source or generate a **second complete bacterial genome** to replace `C_alimapuense` (currently excluded as a contig-level draft). Tthe bacterial cluster needs ≥2 genomes to be a meaningful comparison.
[x] Once both clusters have final source genomes, write/finalize the **Stage 6 output-writing script**.
[ ] Homology/synteny linking (cross-genome ribbons/arcs) is explicitly deferred. Don't scope it into this pass; it needs a separate alignment step (MUMmer/nucmer or locus-tag matching) later.

---

## Phase 7 - Working with Claude Code on this (practical notes)

- Point Claude Code at one stage at a time (e.g. "implement scripts/stage4_gc_skew.py per the spec in CLAUDE.md") rather than the whole pipeline at once, easier to review and correct.
- If you're running Stage 5's bacterial branch, tell Claude Code explicitly that it needs to run in the WSL2 Ubuntu shell / `dnavis-env` conda env, since Claude Code can't infer that pysam/clodius won't work in a native Windows Python.
- Ask Claude Code to write a small validation script that checks each output file against the Section 5 summary table (right columns present, non-empty, correct row counts), cheap way to catch stage bugs early.
- Keep the two genome clusters in separate script runs/output folders from the start so Stage 6 is just a grouping step, not a cleanup step.

---

## Quick reference - where each stage runs

| Stage | Windows native | WSL2 required |
|---|---|---|
| 1. Parse | ✅ | - |
| 2. Sequence extraction | ✅ | - |
| 3. Annotations | ✅ | - |
| 4. GC skew | ✅ | - |
| 5a. Sequence track (mitogenomes) | ✅ | - |
| 5b. Multivec tiling (bacteria, `clodius`) | ❌ (`pysam` unsupported) | ✅ |
| 6. Cluster grouping | ✅ | - |

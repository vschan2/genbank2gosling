# Spec 002 — Gosling.js Visualization Layer

Design for the browser-based comparative genome views built on top of the pipeline outputs from `output/mitogenome_cluster/` and `output/bacterial_cluster/`. This spec covers **both** clusters, since the README already treats them as parallel/symmetric outputs, but the two clusters differ in one important respect: the bacterial sequence track requires a tile server, the mitogenome one doesn't.

**Immediate goal**: get both example clusters — the mitogenomes in `output/mitogenome_cluster/` and the bacterial genomes in `output/bacterial_cluster/` — rendering correctly as Gosling views. Everything else in this spec (picker flexibility, PNG/PDF export, pipeline-trigger UI) supports that goal but the goal itself is just: prove the two genome groups visualize correctly end-to-end.

Decisions locked in for this spec (confirmed with user before writing):

- **Deliverable**: a React app via **Next.js**, using the official [`gosling-react`](https://github.com/gosling-lang/gosling-react) `GoslingComponent` wrapper around `gosling.js`. Supersedes the earlier "static HTML + CDN" decision — interactive features (checkbox picker driving live re-renders, PNG/PDF export, future click-to-inspect) are cleaner as React state/component composition than hand-rolled DOM manipulation, and Next.js gives a natural home for the API routes needed to read pipeline output server-side (see "Running it" below).
- **Bacterial multivec serving**: [higlass-server](https://github.com/higlass/higlass-server) run as a lightweight **non-Docker** install — git clone + a dedicated venv + `pip install -r requirements.txt`, sqlite backend, plain `manage.py runserver` — unchanged in mechanism from the earlier decision, but the *justification* is corrected here: higlass-server's own `requirements.txt`/`settings.py` show SQLite as the default DB (no Postgres dependency at all) and Redis as optional (only wired in if `REDIS_HOST` is set in the environment; the app runs fine without it). There's no documented RAM minimum for `higlass-docker` itself either. The ~6GB figure that motivated avoiding Docker was almost certainly **Docker Desktop's own WSL2 VM overhead**, not higlass-server's actual footprint. That said, the source-install path is still the right call locally: it's the officially documented lightweight method and sidesteps Docker Desktop entirely. Multivec itself still requires *some* HiGlass-API server — confirmed against Gosling's own docs, which state multivec tiles "require a HiGlass server to access them in Gosling" even when pre-aggregated — so this keeps the multivec format (Stage 5 untouched) and only changes how it's served. (Alternatives considered and ruled out: Gosling has no native FASTA/indexed-sequence track, so a range-request-only static approach isn't available; re-encoding as a static bigwig track was viable but would mean redoing Stage 5's already-verified bacterial branch, so it was passed over; higlass.io's free public hosting was ruled out because it means uploading unpublished research genome data to a third-party server.)
- **Code location**: new top-level `web/` directory (the Next.js app), parallel to `scripts/`, `input/`, `output/`. higlass-server's setup scripts move to a top-level `higlass/` directory (previously nested under `viz/higlass/`, which no longer makes sense once the page code moves to `web/` — higlass-server is an independent service, not part of the frontend).
- **Pipeline invocation from the UI**: out of scope for the immediate goal. If added, it's a Next.js API route that spawns `scripts/stageN_*.py` as a subprocess — no FastAPI. See `specs/spec-deferred-future-work.md` for why FastAPI is deferred rather than adopted now.
- **Genome selection**: each cluster page shows an in-page checkbox picker over every genome in that cluster; the Gosling spec is rebuilt from whatever's currently checked, via React state — not a fixed all-genomes chart.
- **Picker data source**: Stage 6 writes a small `manifest.json` per cluster listing its genomes (unchanged from the earlier decision).
- **Mitogenome sequence reshape**: the per-base position Gosling needs is added by `scripts/stage5_sequence_track.py` itself (pipeline output format change), not client-side JS. Documented in `README.md`'s Stage 5 section per `CLAUDE.md`'s convention that README.md is the authoritative pipeline design doc. See "Prerequisite pipeline changes" below.
- **Download/export**: `gosling-react` exposes `api.exportPng()` and `api.exportPdf()` (both support transparent background) via a ref on `GoslingComponent`, plus `api.getCanvas()` for anything needing another format. A "Download" button per cluster view calls these directly — no server-side rendering needed.
- **Future-facing items split out**: server deployment shape, the Next.js-API-routes-to-FastAPI conversion, and production hardening of higlass-server are all deferred and tracked in `specs/spec-deferred-future-work.md`, not scoped into this spec.

## Goal

For each cluster, one Next.js page rendering a Gosling.js multi-view stack: one row-group per **selected** genome (annotation track + GC skew track + sequence track), all row-groups sharing a `linkingId` on `x` so pan/zoom stays synchronized on absolute base-pair position across every genome currently shown — matching the design already sketched in `README.md`'s "Gosling.js View Design" section, extended with a picker instead of a fixed genome set.

Two clusters, two independent pages. Never combined into one chart (same rule as the rest of the pipeline). A comparison is always *within* one cluster — the picker on the mitogenome page only offers mitogenomes, and likewise for bacteria.

## Prerequisite pipeline changes (before viz work starts)

Two small additions to existing stages, made in `scripts/` and documented in `README.md` per the usual "one stage at a time" convention — not part of `web/` itself, but required before the viz pages can be built against them:

1. **Stage 5 (`stage5_sequence_track.py`), mitogenome branch**: change `<genome>_sequence.json` from a flat array of base letters (`["T","T","A",...]`, position implied by index) to an array of per-base records carrying an explicit genomic interval, e.g. `[{"start": 0, "end": 1, "base": "T"}, ...]`. Exact field names should be checked against Gosling's sequence/text track docs at implementation time (see Open Items) before finalizing. Update `README.md`'s Stage 5 section and Output File Summary table to match once the format is settled.
2. **Stage 6 (`stage6_group.py`)**: alongside the existing per-genome grouping, write one `manifest.json` at the top of each cluster output directory (`output/mitogenome_cluster/manifest.json`, `output/bacterial_cluster/manifest.json`) listing the genomes grouped into that cluster. This is still "pure grouping" metadata — it doesn't filter or reorder anything — so it stays consistent with Stage 6's existing scope. Suggested shape:
   ```json
   {
     "cluster": "mitogenome_cluster",
     "genomes": [
       { "id": "B.exclamationis_MtDNA_MZ502489", "organism": "Badamia exclamationis", "accession": "MZ502489.1", "length": 15289 }
     ]
   }
   ```
   (`id` matches the genome's output subdirectory name and file-name prefix, so the viz layer can build all four file paths from it directly.)

## Repository layout (new)

```
genbank-pipeline/
├── web/                              # Next.js + React app
│   ├── app/
│   │   ├── mitogenome/page.tsx       # cluster 1 view: picker + multi-view stack
│   │   ├── bacterial/page.tsx        # cluster 2 view: picker + multi-view stack
│   │   └── api/
│   │       └── genomes/
│   │           └── [cluster]/[...path]/route.ts   # reads output/ server-side, see "Running it"
│   ├── components/
│   │   ├── GenomePicker.tsx          # checkbox list, reads a manifest, controls selection state
│   │   ├── ClusterView.tsx           # wraps GoslingComponent, exposes Download PNG/PDF button
│   │   └── trackStyles.ts            # shared feature-type color palette, track heights
│   ├── lib/
│   │   ├── buildSpec.ts              # pure function: selected genome list -> Gosling spec JSON
│   │   └── manifest.ts               # fetch/type helpers for manifest.json
│   ├── package.json
│   └── next.config.js
└── higlass/
    ├── setup.sh                      # one-time: clones higlass-server, creates a venv, installs deps, runs migrate
    ├── run-server.sh                 # starts `manage.py runserver` (sqlite) on localhost:8989
    ├── register-tilesets.sh          # copies + ingests each *.multires.h5 as a tileset
    ├── higlass-server-src/           # gitignored: cloned higlass-server checkout + its own venv
    └── hg-data/                      # gitignored: local copies of .h5 files the server serves from
```

`web/`'s API routes read pipeline output directly from `../output/mitogenome_cluster/` and `../output/bacterial_cluster/` server-side at request time (including `manifest.json`) — outputs are not copied or duplicated into `web/`, except for the higlass ingestion cache noted below. Since `output/` is gitignored, this keeps the same "regenerate, don't commit" contract the rest of the repo already uses; `higlass/higlass-server-src/` and `hg-data/` are gitignored for the same reason (external tool checkout + a local data cache, not project source). `web/node_modules/` and `web/.next/` are gitignored as standard Next.js build artifacts.

higlass-server gets its own venv (inside `higlass-server-src/`) rather than living in `dnavis-env` — its Django/pinned dependency versions have no reason to line up with clodius/biopython/pandas's, and keeping it isolated avoids a conflict resolution headache in the conda env the rest of the pipeline depends on.

## Running it

Two local services, both dev-only (no deployment target yet — see `specs/spec-deferred-future-work.md`):

1. **Next.js dev server**:
   ```bash
   cd web
   npm install
   npm run dev
   # open http://localhost:3000/mitogenome
   ```
   Unlike the earlier static-HTML plan (a plain `python -m http.server` rooted at the repo root, so `fetch('../output/...')` resolved directly), Next.js's dev server only serves `web/public/` and its own routes — it can't serve an arbitrary sibling directory like `../output/` to the browser directly. So pipeline output is read **server-side**, inside `web/app/api/genomes/[cluster]/[...path]/route.ts`, using Node's `fs` to read from `../output/<cluster>/...` and return it as the response; the browser fetches from the same-origin `/api/genomes/...` path, never `../output/` directly. This also happens to be exactly the seam a future FastAPI service would slot into later (see deferred spec) — the frontend's fetch calls wouldn't need to change, only what's behind `/api/genomes/...`.
2. **higlass-server** (bacterial cluster only), lightweight non-Docker setup — see "higlass-server setup" below for what each script does:
   ```bash
   cd higlass
   ./setup.sh               # one-time: clone + venv + pip install + migrate
   ./register-tilesets.sh   # re-run any time bacterial Stage 5/6 output changes
   ./run-server.sh          # foreground; serves http://localhost:8989 until Ctrl+C
   # in another terminal/tab: open http://localhost:3000/bacterial
   ```
   The mitogenome page has no dependency on this — it's inline JSON end-to-end and works with step 1 alone.

## Genome selection (flexible N-way comparison)

- Each page loads its cluster's `manifest.json` (via `/api/genomes/<cluster>/manifest.json`) on page load and renders `GenomePicker`'s checkbox list from it (one checkbox per genome, label = organism name, sub-label = accession), backed by `useState` for the checked set.
- A "Generate view" action (or live-on-change, TBD at implementation time — live re-render is nicer UX but worth checking it doesn't feel janky with 5+ genomes) takes the current checked set and calls `buildSpec()` with that list, producing a fresh Gosling spec passed as `ClusterView`'s `spec` prop.
- No minimum/maximum genome count enforced by the picker itself — 1 genome is just a single-row view, all genomes checked is the old "compare everything" case. The only rule is "at least one checked to render anything."
- No selection persistence (no URL query param, no localStorage) for this pass — reopening the page resets to no selection. Revisit later if shareable/bookmarkable comparisons become a real need.

## Per-genome track composition

Each selected genome gets one row-group, built by `buildSpec.ts` from its four Stage 6 output files (paths derived from its manifest `id`):

| Track | Source file | Gosling track type | Notes |
|---|---|---|---|
| Annotations | `<genome>_annotations.bed` | rect/triangle marks on a BED/TSV data track | Color by `type` column (gene/CDS/tRNA/rRNA/D-loop/...); tooltip shows `name` + `strand`. One shared color scale across all genomes in the cluster (`components/trackStyles.ts`) so feature types read consistently regardless of which subset is selected. |
| GC skew | `<genome>_gc_skew.bedgraph` | line/area marks, two overlaid series | Columns are `chrom, start, end, gc_skew, cumulative_gc_skew` — windowed skew and cumulative skew plotted as two series (e.g. thin line for windowed, filled area for cumulative) in the same track, not two separate tracks, to keep row-group height manageable. |
| Sequence | mitogenome: `<genome>_sequence.json` (positioned records, see prerequisite change above); bacteria: `<genome>_multivec/<genome>.multires.h5` | mitogenome: `text` mark gated by zoom-level visibility rule; bacteria: Gosling `multivec` track pointing at the higlass-server tileset | Bacterial tileset UID = the genome's manifest `id`, matching how `register-tilesets.sh` registers it. |

Row-group label: `organism` (+ `accession` as subtitle), read straight from `manifest.json` — no need to fetch each genome's `_meta.json` separately just for display.

Row-group order: same order the genomes appear in `manifest.json` (i.e. `stage6_group.py`'s grouping order), filtered down to whatever's currently checked.

## higlass-server setup (local, no Docker)

`higlass/` holds everything needed to stand up a local HiGlass tileset server for the bacterial cluster's multivec tracks — Gosling can't read `.multires.h5` directly in-browser, it needs to fetch tiles over HTTP from a server implementing the HiGlass tileset API. higlass-server is the reference implementation, run here as a plain Django dev server (sqlite, no Postgres/Redis required) — see the corrected justification in "Decisions locked in" above for why Docker was ruled out.

**`setup.sh`** — one-time: clones higlass-server and sets it up in its own venv, isolated from `dnavis-env`:
```bash
#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [[ ! -d higlass-server-src ]]; then
  git clone https://github.com/higlass/higlass-server.git higlass-server-src
fi

cd higlass-server-src
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
python manage.py migrate
deactivate

echo "higlass-server installed. Run ./register-tilesets.sh then ./run-server.sh."
```

**`register-tilesets.sh`** — copies each bacterial genome's `.multires.h5` into `hg-data/` (flattened, so it's addressed by a simple filename regardless of the nested `output/` directory structure) and ingests it into higlass-server's sqlite DB via its management command, keyed by the manifest `id` so `buildSpec.ts` can reference a predictable tileset UID. This is a DB write, not an HTTP call, so it doesn't require `run-server.sh` to be running at the same time:
```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACTERIAL_DIR="$REPO_ROOT/output/bacterial_cluster"
HG_DATA_DIR="$SCRIPT_DIR/hg-data"

mkdir -p "$HG_DATA_DIR"
cd "$SCRIPT_DIR/higlass-server-src"
source .venv/bin/activate

for genome_dir in "$BACTERIAL_DIR"/*/; do
  genome="$(basename "$genome_dir")"
  h5_file="$genome_dir${genome}_multivec/${genome}.multires.h5"

  if [[ ! -f "$h5_file" ]]; then
    echo "WARNING: missing $h5_file, skipping $genome" >&2
    continue
  fi

  cp "$h5_file" "$HG_DATA_DIR/${genome}.multires.h5"
  python manage.py ingest_tileset \
    --filename "$HG_DATA_DIR/${genome}.multires.h5" \
    --filetype multivec \
    --datatype multivec \
    --uid "$genome"
  echo "Registered $genome"
done
```

**`run-server.sh`** — starts the dev server, foreground, until stopped:
```bash
#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/higlass-server-src"
source .venv/bin/activate
python manage.py runserver localhost:8989
```

Once running, sanity-check with:
```bash
curl "http://localhost:8989/api/v1/tileset_info/?d=<a-genome-id>"
```
Re-run `register-tilesets.sh` any time Stage 5/6 is re-run and bacterial outputs change (it's idempotent — re-copying and re-ingesting the same UID overwrites the prior registration).

`buildSpec.ts` points each genome's multivec track at `server: "http://localhost:8989/api/v1"`, `tilesetUid: "<genome-id>"`.

Notes / things to verify once this is actually stood up (also listed under Open Items):
- The management command name (`ingest_tileset` above) and exact flags can differ across higlass-server versions — confirm against whatever's on the branch `setup.sh` clones before trusting the script for all 7 genomes.
- Django's dev server (`runserver`) is explicitly not meant for production, but that's fine here — this is a local, single-user, dev-only viewer per the Non-goals below.
- CORS: the Next.js dev server (port 3000) and higlass-server (port 8989) are different origins — confirm `bacterial/page.tsx` can actually fetch tiles; may need `django-cors-headers` (already in higlass-server's `requirements.txt`) configured to allow `localhost:3000` if the default config doesn't.

## Data format notes / adapters needed

- **BED annotations**: already 0-based half-open, columns `chrom start end name score strand type` — matches Gosling's default BED-like CSV/TSV adapter (`chromosomeField`, `genomicFields: [start, end]`) directly, just need `separator: "\t"` and explicit field naming since there's no header row. Served to the browser via `/api/genomes/<cluster>/<genome>/annotations.bed`.
- **GC skew bedgraph**: same shape, tab-separated, no header — straightforward CSV/TSV adapter with two `y`-mapped fields. Served the same way as annotations.
- **Mitogenome sequence JSON**: reshaped at the source by Stage 5 (see "Prerequisite pipeline changes" above) — the viz layer consumes positioned records directly via the API route, no client-side transform needed.
- **Bacterial multivec**: consumed directly by Gosling's `multivec` data type once higlass-server is serving it — no client-side reshaping needed, and not proxied through the Next.js API route (Gosling fetches tiles straight from higlass-server).
- **manifest.json**: consumed by `GenomePicker` and `buildSpec.ts` to enumerate genomes and derive file paths — no transform needed, served via `/api/genomes/<cluster>/manifest.json`.

## Styling conventions

- One shared feature-type → color mapping (`components/trackStyles.ts`), reused across every genome in both clusters, so e.g. `CDS` is the same color in every row-group regardless of which genomes are selected.
- Consistent track heights per track type across all row-groups in a cluster, so genomes visually line up.

## Non-goals (unchanged from README, updated for this spec)

- No homology/synteny linking between genomes — deferred, same as the pipeline spec already states.
- No deployment/hosting story yet — this is a local dev-only viewer (`next dev` + a local Django dev server for higlass-server). See `specs/spec-deferred-future-work.md`.
- No FastAPI service yet — pipeline invocation (if built at all in this pass) stays as direct subprocess calls from Next.js API routes.
- No selection persistence (URL params / saved comparisons) in this pass — see "Genome selection" above.

## Open items / risks

- **higlass-server + clodius version compatibility, and exact ingestion command**: verify one bacterial genome's `.multires.h5` registers and tiles correctly end-to-end (including the `ingest_tileset` command name/flags used above) before trusting `register-tilesets.sh` to loop over all 7 — clodius and higlass-server evolve somewhat independently, worth a manual smoke test first.
- **Exact Gosling sequence/text track schema**: confirm the `{start, end, base}` shape proposed for the reshaped Stage 5 output against current Gosling.js docs/examples before finalizing the format change — the field names should be verified against a working example, not assumed.
- **CORS between Next.js dev server and higlass-server**: port 3000 and port 8989 are different origins; needs explicit CORS allowance on the higlass-server side.
- **Live re-render vs. explicit "Generate" button** for the picker: worth a quick UX check once there's a working prototype — live re-render on every checkbox click could feel laggy with several large bacterial genomes' multivec tracks loading at once.
- **PNG/PDF export fidelity**: `exportPng()`/`exportPdf()` resolution and layout haven't been checked against a real multi-genome row-group stack yet — confirm output is actually usable (not clipped/low-res) before treating "download view" as done.
- **Next.js API route file-reading performance**: reading BED/bedgraph/sequence JSON server-side on every request is presumably fine at this data scale (single local user, per-genome files in the KB–low-MB range), but worth a sanity check once real bacterial-genome-sized annotation/GC-skew files are wired up.

## Implementation order

Per `CLAUDE.md`'s "one stage at a time" convention, and prioritizing the immediate goal (both example clusters visualizing correctly) over full picker/export polish:

1. **Stage 5 mitogenome reshape + Stage 6 manifest.json** — small, isolated pipeline changes; update `README.md`'s Stage 5 section and Output File Summary table to match. Re-run both stages for the mitogenome cluster (and Stage 6 for bacteria, for the manifest) to regenerate outputs.
2. **`web/` scaffold + mitogenome page** — Next.js app init, the `/api/genomes/...` route reading `output/` server-side, `GenomePicker`, `ClusterView`, `buildSpec.ts`, wired up end-to-end for the mitogenome cluster. No external service dependency, so this is the fastest path to satisfying the immediate goal for one cluster and de-risks the Gosling track structure, the API-route data path, and the selection UI before the harder bacterial branch.
3. **higlass-server non-Docker setup** (`setup.sh`) + tileset registration (`register-tilesets.sh`), smoke-tested against one bacterial genome before running it over all 7.
4. **Bacterial page**, reusing the row-group/track/picker patterns validated in step 2, wired to the higlass-server multivec tileset from step 3 — completes the immediate goal (both clusters visualizing correctly).
5. **(Stretch, optional)** PNG/PDF download button, live-vs-button picker UX decision, `/api/run-pipeline` route for triggering stage scripts from the UI — none of these block the immediate goal, so they can slip past it if time-constrained.

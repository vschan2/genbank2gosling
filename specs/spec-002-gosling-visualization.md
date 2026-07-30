# Spec 002 — Gosling.js Visualization Layer

Design for the browser-based comparative genome views built on top of the pipeline outputs from `output/mitogenome_cluster/` and `output/bacterial_cluster/`. This spec covers **both** clusters, since the README already treats them as parallel/symmetric outputs, but the two clusters differ in one important respect: the bacterial sequence track requires a tile server, the mitogenome one doesn't.

**Immediate goal**: get both example clusters — the mitogenomes in `output/mitogenome_cluster/` and the bacterial genomes in `output/bacterial_cluster/` — rendering correctly as Gosling views. Everything else in this spec (picker flexibility, PNG/PDF export, pipeline-trigger UI) supports that goal but the goal itself is just: prove the two genome groups visualize correctly end-to-end.

Decisions locked in for this spec (confirmed with user before writing):

- **Deliverable**: a React app via **Next.js**, using `gosling.js`'s own `GoslingComponent` React component (and `embed()` for non-React use). Supersedes the earlier "static HTML + CDN" decision — interactive features (checkbox picker driving live re-renders, PNG/PDF export, future click-to-inspect) are cleaner as React state/component composition than hand-rolled DOM manipulation, and Next.js gives a natural home for the API routes needed to read pipeline output server-side (see "Running it" below). **Correction from initial drafting**: there is no separate `gosling-react` package — `GoslingComponent` is exported directly from `gosling.js` (confirmed: `gosling-react` and `@gosling-lang/gosling-react` both 404 on the npm registry). Install just `gosling.js` itself.
- **Bacterial multivec serving**: [higlass-server](https://github.com/higlass/higlass-server) run as a lightweight **non-Docker** install — git clone + a dedicated **conda env built from higlass-server's own `environment.yml`**, sqlite backend, plain `manage.py runserver`. The *justification* for avoiding Docker: higlass-server's own `requirements.txt`/`settings.py` show SQLite as the default DB (no Postgres dependency at all) and Redis as optional (only wired in if `REDIS_HOST` is set in the environment; the app runs fine without it). There's no documented RAM minimum for `higlass-docker` itself either. The ~6GB figure that motivated avoiding Docker was almost certainly **Docker Desktop's own WSL2 VM overhead**, not higlass-server's actual footprint. That said, the source-install path is still the right call locally: it's the officially documented lightweight method and sidesteps Docker Desktop entirely. Multivec itself still requires *some* HiGlass-API server — confirmed against Gosling's own docs, which state multivec tiles "require a HiGlass server to access them in Gosling" even when pre-aggregated — so this keeps the multivec format (Stage 5 untouched) and only changes how it's served. (Alternatives considered and ruled out: Gosling has no native FASTA/indexed-sequence track, so a range-request-only static approach isn't available; re-encoding as a static bigwig track was viable but would mean redoing Stage 5's already-verified bacterial branch, so it was passed over; higlass.io's free public hosting was ruled out because it means uploading unpublished research genome data to a third-party server.)
- **Code location**: new top-level `web/` directory (the Next.js app), parallel to `scripts/`, `input/`, `output/`. The higlass-server *checkout* lives at `higlass-server/`, **outside this repo entirely** — a sibling directory of `genbank-pipeline/` itself (since higlass-server is an independent service with its own git history/conda-env/dependency set, not project source). The scripts that drive that checkout (`setup.sh`, `register-tilesets.sh`, `run-server.sh`) live *inside* this repo instead, in `higlass-server-ops/`, precisely because the checkout itself is a flat, pristine upstream clone with no room for our own files mixed in — see "higlass-server setup" below.
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

## Repository layout

The **higlass-server checkout itself** lives outside `genbank-pipeline/` entirely — a sibling directory, one level up. But the three small scripts that drive it (`setup.sh`, `register-tilesets.sh`, `run-server.sh`) live *inside* `genbank-pipeline/`, in their own `higlass-server-ops/` folder, tracked by this repo's git like everything else in `scripts/`/`web/`. Splitting it this way avoids a chicken-and-egg problem: `setup.sh` needs to `git clone` higlass-server into an empty directory, which it can't do if our own scripts are already sitting inside that same directory — and mixing our scripts into someone else's upstream checkout (where they'd show up as untracked files in *its* `.git`) would be messy regardless.

```
parent-dir/
├── genbank-pipeline/                 # this repo
│   ├── scripts/
│   ├── input/                        # gitignored
│   ├── output/                       # gitignored
│   ├── higlass-server-ops/           # tracked by this repo; drives the sibling higlass-server/ checkout
│   │   ├── setup.sh                  # one-time: clones higlass-server, creates its conda env, runs migrate
│   │   ├── register-tilesets.sh      # copies + ingests each *.multires.h5 as a tileset
│   │   └── run-server.sh             # starts `manage.py runserver` (sqlite) on localhost:8989
│   └── web/                          # Next.js + React app
│       ├── app/
│       │   ├── mitogenome/page.tsx       # cluster 1 view: picker + multi-view stack
│       │   ├── bacterial/page.tsx        # cluster 2 view: picker + multi-view stack
│       │   └── api/
│       │       └── genomes/
│       │           └── [cluster]/[...path]/route.ts   # reads output/ server-side, see "Running it"
│       ├── components/
│       │   ├── GenomePicker.tsx          # checkbox list, reads a manifest, controls selection state
│       │   ├── ClusterView.tsx           # wraps GoslingComponent, exposes Download PNG/PDF button
│       │   └── trackStyles.ts            # shared feature-type color palette, track heights
│       ├── lib/
│       │   ├── buildSpec.ts              # pure function: selected genome list -> Gosling spec JSON
│       │   └── manifest.ts               # fetch/type helpers for manifest.json
│       ├── package.json
│       └── next.config.js
└── higlass-server/                   # NOT part of the genbank-pipeline git repo — pristine upstream clone
    └── media/hg-data/                # local copies of .h5 files the server serves from (must be inside MEDIA_ROOT)
```

`web/`'s API routes read pipeline output directly from `../output/mitogenome_cluster/` and `../output/bacterial_cluster/` server-side at request time (including `manifest.json`) — outputs are not copied or duplicated into `web/`. Since `output/` is gitignored, this keeps the same "regenerate, don't commit" contract the rest of the repo already uses. `web/node_modules/` and `web/.next/` are gitignored as standard Next.js build artifacts.

The external `higlass-server/` checkout (including its conda env and `media/hg-data/`) needs **no gitignore entries at all** — it lives entirely outside `genbank-pipeline/`'s working tree, so it was never a candidate for being tracked here in the first place. `higlass-server-ops/`, by contrast, *is* committed to this repo like any other project code — it's just three small shell scripts, no generated data.

higlass-server gets its own conda env (built from its own `environment.yml`, see "higlass-server setup" below) rather than living in `dnavis-env` — its Django/pinned dependency versions have no reason to line up with clodius/biopython/pandas's, and keeping it isolated avoids a conflict resolution headache in the conda env the rest of the pipeline depends on.

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

   **Revised after a real end-to-end smoke test** (scaffold `web/`, ingest one bacterial genome, render a minimal single-genome linear Gosling view) — this surfaced two hard version/config requirements, not just nice-to-haves:
   - **Pin `create-next-app` to Next.js 14, not `@latest`/16.** Next 16 bundles its own internal compiled `react-dom` (`next/dist/compiled/react-dom`) for framework-level rendering, and that internal copy is React 19 *regardless of what `react`/`react-dom` version the app's own `package.json` pins*. `higlass` (via `react-grid-layout`) still calls the legacy `ReactDOM.findDOMNode`, which React 19 removed outright (not just deprecated) — this crashes with `TypeError: ...findDOMNode is not a function` no matter how carefully react/react-dom are downgraded to 18 in the app's own dependency tree. Next 14 doesn't have this problem: its own internal React copy is React-18-native. Scaffold with `npx create-next-app@14 web ...`, and gosling.js/higlass/pixi.js install cleanly on top without any manual react downgrade step.
   - **Set `reactStrictMode: false` in `next.config.mjs`.** Next.js defaults this to `true`. In dev, Strict Mode intentionally double-mounts/unmounts components to surface side-effect bugs — but `HiGlassComponent2`'s PIXI-renderer teardown can't tolerate being unmounted before its renderer finishes initializing, throwing `TypeError: Cannot read properties of null (reading 'destroy')` in `componentWillUnmount`. Disabling Strict Mode avoids this; there's no known equivalent fix inside HiGlass itself to keep Strict Mode on.
   - **Default `create-next-app` dark-mode CSS bleeds through around the Gosling canvas.** The scaffolded `app/globals.css` includes a `@media (prefers-color-scheme: dark)` block that swaps the page background to near-black. Since Gosling renders to a fixed-pixel-size canvas (not a responsive/full-bleed element), any OS in dark mode shows a jarring black margin around the chart. Stripped this media query from `globals.css` — this app doesn't need OS-dark-mode support, it's a fixed light-theme data viz tool.
   - Also note: `npm ls` reports `ELSPROBLEMS` for a couple of transitive peer-dep mismatches (`react-simple-code-editor`, `react-sortable-hoc`, both pulled in by gosling.js's own bundled internal `higlass@1.13.6` copy, declaring an old `^16.0.0` peer). Confirmed benign — these are internal HiGlass editor-UI widgets not exercised via the `GoslingComponent`/`embed()` API surface this app actually uses. Safe to ignore, not worth chasing a clean `npm ls`.
2. **higlass-server** (bacterial cluster only), lightweight non-Docker setup, driven from `higlass-server-ops/` inside this repo but standing up its actual checkout as a **sibling of `genbank-pipeline/`** — see "higlass-server setup" below for what each script does:
   ```bash
   cd higlass-server-ops
   ./setup.sh               # one-time or manually follow the step in this script: clone (to ../../higlass-server) + conda env + migrate
   ./register-tilesets.sh   # re-run any time bacterial Stage 5/6 output changes
   ./run-server.sh          # foreground; serves http://localhost:8989 until Ctrl+C
   # in another terminal/tab: open http://localhost:3000/bacterial
   ```
   All three scripts default to `../../higlass-server` (i.e. a sibling of `genbank-pipeline/`) for the checkout location, overridable via `HIGLASS_SERVER_DIR` — see the scripts below. The mitogenome page has no dependency on this — it's inline JSON end-to-end and works with step 1 alone.

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
| Sequence | mitogenome: `<genome>_sequence.json` (positioned records, see prerequisite change above); bacteria: `<genome>_multivec/<genome>.multires.h5` | mitogenome: `text` mark gated by zoom-level visibility rule; bacteria: Gosling `multivec` track pointing at the higlass-server tileset; example: https://gosling.js.org/?example=SEQUENCE | Bacterial tileset UID = the genome's manifest `id`, matching how `register-tilesets.sh` registers it. |

Row-group label: `organism` (+ `accession` as subtitle), read straight from `manifest.json` — no need to fetch each genome's `_meta.json` separately just for display.

Row-group order: same order the genomes appear in `manifest.json` (i.e. `stage6_group.py`'s grouping order), filtered down to whatever's currently checked.

## higlass-server setup (local, no Docker)

`higlass-server/` holds everything needed to stand up a local HiGlass tileset server for the bacterial cluster's multivec tracks — Gosling can't read `.multires.h5` directly in-browser, it needs to fetch tiles over HTTP from a server implementing the HiGlass tileset API. higlass-server is the reference implementation, run here as a plain Django dev server (sqlite, no Postgres/Redis required) — see the corrected justification in "Decisions locked in" above for why Docker was ruled out. As covered in "Repository layout" above, `higlass-server/` is checked out as a **sibling of `genbank-pipeline/`**, not inside it — so `register-tilesets.sh` below needs to be told where the pipeline's `output/bacterial_cluster/` lives rather than assuming it's the parent directory.

**Revised after a real end-to-end smoke test** (ingest + serve against one actual bacterial genome's `.multires.h5`, not higlass-server's bundled example data) — this surfaced three concrete, verified issues that reshape the setup below from what was originally planned:

1. **Install via conda, not a `python3.7` venv + `pip install -r requirements.txt`.** higlass-server ships its own `environment.yml` (`python>=3.6`, conda-forge + bioconda channels) — that's the officially-supported install path, because `pybbi` is a C-extension package that's far easier to get as a prebuilt conda-forge/bioconda binary than to build from a pip sdist. `setup.sh` below uses that.
2. **The checkout is flat, not nested — and it's not where our scripts live.** `higlass-server/` *is* the higlass-server checkout itself (its own `.git`, `manage.py`, `media/`, etc. live directly inside it), with no wrapper directory or nested `higlass-server-src/` subfolder — which is exactly why `setup.sh`/`register-tilesets.sh`/`run-server.sh` live in `genbank-pipeline/higlass-server-ops/` instead (see "Repository layout" above): there's no room to keep our own scripts inside a pristine upstream clone. `hg-data/` for ingested files must live *inside* Django's `MEDIA_ROOT` (`higlass-server/media/`, confirmed by reading `higlass_server/settings.py`) — ingesting a file that lives outside `MEDIA_ROOT` (e.g. referencing `output/bacterial_cluster/.../*.multires.h5` in place via `--no-upload`) fails at serve time with `SuspiciousFileOperation: ... is located outside of the base path component`. So the copy-into-`hg-data/`-before-ingesting step is a **hard requirement**, not tidiness.
3. **Tileset UIDs must not contain periods.** higlass-server's tile-serving endpoint parses a requested tile ID by splitting on `.` and taking the *first* segment as the tileset UUID (`tilesets/views.py`, `tile_id.split('.')`, `tileset_uuid = tile_id_parts[0]`). Every genome ID in this pipeline's manifests contains a period (e.g. `C.callunae_DSC_20147_CP004354`, from the `Genus-abbrev.species` naming convention) — passed straight through as `--uid`, the tiles endpoint reads only `"C"` as the UUID and 500s with `Tileset.DoesNotExist`. `register-tilesets.sh` below sanitizes the UID (`.` → `-`) before registering; `buildSpec.ts` must use that same sanitized form for `tilesetUid`, not the raw manifest `id`.
4. **Pin `clodius` to the version that wrote the file, not whatever the env resolves to.** `environment.yml` pins `clodius==0.12.0`/`h5py==2.6.0`, but conda's solver doesn't actually honor that on a modern system — it resolved `clodius 0.18.0` + `h5py 3.8.0` instead. `clodius 0.18.0`'s `multivec.py` unconditionally calls `.decode("utf8")` on HDF5 string attributes, assuming `bytes`; `h5py>=3` returns native `str`, so `tileset_info()` crashes with `AttributeError: 'str' object has no attribute 'decode'`. This is a real version-skew bug between the clodius that *wrote* the file (`dnavis-env`'s `clodius 0.20.4`, which already has an `isinstance(row_infos[0], str)` guard for this) and the clodius *reading* it. Confirmed fix: `pip install "clodius==0.20.4"` inside the `higlass-server` conda env (a pure-Python wheel, no `Requires-Python` floor — verified via `pip install --dry-run` that every dependency, including `pysam`/`pydantic`/`pandas`, already resolves cleanly under the env's Python 3.7; only `cooler` bumps alongside it, to `0.9.3`). `setup.sh` installs this version explicitly rather than trusting whatever `environment.yml` resolves to.

All three scripts below live in `genbank-pipeline/higlass-server-ops/` and default `HIGLASS_SERVER_DIR` to `$SCRIPT_DIR/../../higlass-server` — i.e. a sibling of `genbank-pipeline/` — overridable via the environment if the checkout lives elsewhere relative to this repo.

**`setup.sh`** — one-time: clones higlass-server (flat) into `HIGLASS_SERVER_DIR`, creates a dedicated conda env from its own `environment.yml`, then overrides the `clodius` pin to the version verified against this pipeline's output:
```bash
#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HIGLASS_SERVER_DIR="${HIGLASS_SERVER_DIR:-$SCRIPT_DIR/../../higlass-server}"

if [[ ! -d "$HIGLASS_SERVER_DIR/.git" ]]; then
  git clone https://github.com/higlass/higlass-server.git "$HIGLASS_SERVER_DIR"
fi

cd "$HIGLASS_SERVER_DIR"
conda env create -f environment.yml -n higlass-server || conda env update -f environment.yml -n higlass-server
conda run -n higlass-server pip install "clodius==0.20.4"   # environment.yml's pin doesn't match dnavis-env's writer version; see notes above
conda run -n higlass-server python manage.py migrate

echo "higlass-server installed at $HIGLASS_SERVER_DIR. Run ./register-tilesets.sh then ./run-server.sh."
```

**`register-tilesets.sh`** — copies each bacterial genome's `.multires.h5` into `$HIGLASS_SERVER_DIR/media/hg-data/` (inside higlass-server's `MEDIA_ROOT`, flattened so it's addressed by a simple filename regardless of the nested `output/` directory structure), sanitizes its manifest `id` into a dot-free tileset UID, and ingests it into higlass-server's sqlite DB via its management command. This is a DB write, not an HTTP call, so it doesn't require `run-server.sh` to be running at the same time. Since this script lives inside `genbank-pipeline/higlass-server-ops/`, the pipeline's own `output/bacterial_cluster/` is found relative to itself — no separate override needed for that half:
```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HIGLASS_SERVER_DIR="${HIGLASS_SERVER_DIR:-$SCRIPT_DIR/../../higlass-server}"
BACTERIAL_DIR="$SCRIPT_DIR/../output/bacterial_cluster"
HG_DATA_DIR="$HIGLASS_SERVER_DIR/media/hg-data"

mkdir -p "$HG_DATA_DIR"
cd "$HIGLASS_SERVER_DIR"

for genome_dir in "$BACTERIAL_DIR"/*/; do
  genome="$(basename "$genome_dir")"
  h5_file="$genome_dir${genome}_multivec/${genome}.multires.h5"
  uid="${genome//./-}"   # tile IDs are dot-delimited server-side; a "." in the UID breaks tile lookups

  if [[ ! -f "$h5_file" ]]; then
    echo "WARNING: missing $h5_file, skipping $genome" >&2
    continue
  fi

  cp "$h5_file" "$HG_DATA_DIR/${uid}.multires.h5"
  conda run -n higlass-server python manage.py ingest_tileset \
    --filename "$HG_DATA_DIR/${uid}.multires.h5" \
    --filetype multivec \
    --datatype multivec \
    --uid "$uid"
  echo "Registered $genome as $uid"
done
```

**`run-server.sh`** — starts the dev server, foreground, until stopped:
```bash
#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HIGLASS_SERVER_DIR="${HIGLASS_SERVER_DIR:-$SCRIPT_DIR/../../higlass-server}"
cd "$HIGLASS_SERVER_DIR"
conda run --no-capture-output -n higlass-server python manage.py runserver localhost:8989
```

Once running, sanity-check with (note the sanitized, dot-free UID):
```bash
curl "http://localhost:8989/api/v1/tileset_info/?d=<sanitized-genome-uid>"
```
Re-run `register-tilesets.sh` any time Stage 5/6 is re-run and bacterial outputs change (it's idempotent — re-copying and re-ingesting the same UID overwrites the prior registration).

**Correction from initial drafting**: `gosling.js`'s `MultivecData` type has no separate `server`/`tilesetUid` fields — just a single combined `url`. `buildSpec.ts` must build each genome's multivec track `data.url` as `` `http://localhost:8989/api/v1/tileset_info/?d=<genome-id with '.' replaced by '-'>` `` — **not** the raw manifest `id` — matching `register-tilesets.sh`'s sanitization. `manifest.ts` or `buildSpec.ts` should centralize this `id → uid` transform (and the URL-building) in one place so the two scripts can't drift apart. Confirmed working end-to-end in the bacterial smoke test (see Open Items).

Notes / things to verify once this is actually stood up (also listed under Open Items):
- The management command name (`ingest_tileset` above) and flags were confirmed against the actual cloned branch during the smoke test above — this is no longer a guess, but re-verify if `setup.sh` ever clones a different higlass-server ref.
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
- **Track `height` is per-`row`-facet, not total, when a track uses a nominal `row` channel** (confirmed via the bacterial multivec smoke test, which facets by `base` into 4 rows: A/T/G/C). The rendered track height is `height × <number of row categories>` — e.g. `height: 500` on the 4-category multivec track renders ~2000px tall, not 500px. `trackStyles.ts`'s track-height constants should account for this per track type (multivec tracks need a *much* smaller `height` value than single-row tracks like GC skew to end up visually comparable). Because Gosling renders to a fixed-pixel canvas rather than a CSS-responsive element, fitting a view to the actual browser viewport means computing `height` from `window.innerHeight` (and a fixed per-row category count) in an effect with a resize listener, not passing a static number — see `BacterialSmokeTest.tsx` for the pattern to carry into `ClusterView.tsx`.

## Non-goals (unchanged from README, updated for this spec)

- No homology/synteny linking between genomes — deferred, same as the pipeline spec already states.
- No deployment/hosting story yet — this is a local dev-only viewer (`next dev` + a local Django dev server for higlass-server). See `specs/spec-deferred-future-work.md`.
- No FastAPI service yet — pipeline invocation (if built at all in this pass) stays as direct subprocess calls from Next.js API routes.
- No selection persistence (URL params / saved comparisons) in this pass — see "Genome selection" above.

## Open items / risks

- ~~higlass-server + clodius version compatibility, and exact ingestion command~~ — **resolved**: smoke-tested end-to-end against a real bacterial genome (`C.callunae_DSC_20147_CP004354`). Found and fixed a genuine `clodius`/`h5py` version-skew bug (0.18.0's `multivec.py` assumes `bytes`, crashes under `h5py>=3`) by pinning `clodius==0.20.4` in the `higlass-server` conda env, and found a genuine tileset-UID bug (periods in the UID break tile-ID parsing) fixed by sanitizing `.`→`-` in `register-tilesets.sh`. Both are folded into "higlass-server setup" above. Remaining: re-run this same smoke test after `register-tilesets.sh` is committed as an actual file (right now it's only been run as ad hoc shell commands against one genome) to confirm the *scripted* loop-over-all-7 version behaves the same way.
- **Bacterial genome IDs containing periods, beyond just the tileset UID**: the `.` → `-` sanitization above is scoped to the HiGlass UID specifically. Double check whether any other consumer of the manifest `id` (e.g. Next.js dynamic route segments in `[cluster]/[...path]/route.ts`) has similar delimiter assumptions before assuming `id` is safe to use unmodified everywhere.
- **Exact Gosling sequence/text track schema**: confirm the `{start, end, base}` shape proposed for the reshaped Stage 5 output against current Gosling.js docs/examples before finalizing the format change — the field names should be verified against a working example, not assumed. Still open — not yet reached in implementation order (see below).
- ~~CORS between Next.js dev server and higlass-server~~ — **resolved**: confirmed via direct `curl` with an `Origin` header that higlass-server already returns `Access-Control-Allow-Origin: *` by default. No `django-cors-headers` configuration needed.
- **Live re-render vs. explicit "Generate" button** for the picker: worth a quick UX check once there's a working prototype — live re-render on every checkbox click could feel laggy with several large bacterial genomes' multivec tracks loading at once.
- **PNG/PDF export fidelity**: `exportPng()`/`exportPdf()` resolution and layout haven't been checked against a real multi-genome row-group stack yet — confirm output is actually usable (not clipped/low-res) before treating "download view" as done.
- **Next.js API route file-reading performance**: reading BED/bedgraph/sequence JSON server-side on every request is presumably fine at this data scale (single local user, per-genome files in the KB–low-MB range), but worth a sanity check once real bacterial-genome-sized annotation/GC-skew files are wired up.
- **NEW, still open — multivec track goes blank past the first tile when panning/zoomed in far.** Found during the bacterial single-genome smoke test: zoomed in enough that the view spans more than one HiGlass tile (tile size 1024 positions at the finest resolution; the exact bp span per tile varies with the zoom level Gosling picks), the first tile renders correctly but every subsequent tile in view renders blank — reproduced at multiple zoom levels/tile-boundary positions, not a one-off. **Confirmed not a data or server issue**: queried `/api/v1/tiles/?d=<uid>.<z>.<x>` directly for several `x` values at high zoom (including the specific tile just past the blank boundary) — every tile, including the ones Gosling fails to render, decodes (base64 → float16 → reshape `[4, 1024]`) to correctly one-hot-encoded A/T/G/C data, same nonzero-value pattern as the first (working) tile. Tried switching `assembly` from the bare `'unknown'` string to an explicit `ChromSizes` tuple (`[[chromName, length]]`) — this fixed axis tick labels (now show `CP004354.1: 500,000` instead of unlabeled positions) but did **not** fix the blanking. This looks like a genuine client-side tile-stitching limitation in Gosling.js/HiGlass's multivec track for a custom (non-preset) single-chromosome assembly — needs further investigation (check Gosling.js GitHub issues for known multivec + custom-assembly bugs) before the bacterial page can be considered done, though it doesn't block the immediate smoke-test goal of proving data flows end-to-end and renders (whole-genome and moderate-zoom views work fine; only very-high-zoom multi-tile spans are affected).

## Implementation order

Per `CLAUDE.md`'s "one stage at a time" convention, and prioritizing the immediate goal (both example clusters visualizing correctly) over full picker/export polish.

**Reordered partway through** (user call): rather than building the full mitogenome page next after scaffolding, de-risk the harder/riskier bacterial multivec + higlass-server path *first*, with the smallest possible slice — one hardcoded genome, one linear track, no picker — before investing in either full page. Rationale: the bacterial branch has by far the most external moving parts (a second server, a tile-serving protocol, a still-evolving React/Next version compatibility question), so validating that it can render *at all* is higher-value early information than a fully-featured mitogenome page would be.

1. ~~**Stage 5 mitogenome reshape + Stage 6 manifest.json**~~ — **done** (prior session). `output/mitogenome_cluster/manifest.json` and `output/bacterial_cluster/manifest.json` both exist and are current.
2. ~~**`web/` scaffold**~~ — **done**, on Next.js 14 (not `@latest`/16 — see "Running it" above for why) with `gosling.js`, `higlass`, `pixi.js`. Went through a couple of destroy/recreate cycles before landing on a clean install order (see "Running it" above).
3. ~~**higlass-server non-Docker setup + tileset registration for one genome**~~ — **done**. `C.callunae_DSC_20147_CP004354` ingested and confirmed servable (`tileset_info` and `tiles` endpoints both verified via direct `curl`, including a CORS check with an `Origin` header).
4. ~~**Minimal single-genome linear Gosling view (bacterial), no picker**~~ — **done, smoke test passed with a known open issue**. `BacterialSmokeTest.tsx` renders the one ingested genome's A/T/G/C multivec track as colored bars, confirming the full chain (Stage 5/6 output → higlass-server → Gosling `multivec` track → browser) works end-to-end. Two config bugs found and fixed along the way (Next.js version pin, Strict Mode) — see "Running it" above. One real bug remains open — the high-zoom multi-tile blanking issue documented in Open Items — but doesn't block treating this smoke test as a success, per the reduced scope agreed for this step (no flexible/picker features needed yet, just "does it display correctly").
5. **Next up — mitogenome JSON page**: full `mitogenome/page.tsx` with `GenomePicker` + `ClusterView` + `buildSpec.ts`, reading `output/mitogenome_cluster/` via the `/api/genomes/...` route. No external service dependency, so this is the fastest path to a complete first cluster page, and de-risks the picker/multi-genome row-group UI before carrying it over to the bacterial page.
6. **Then — complete/flexible bacterial page**: extend the smoke test into the real `bacterial/page.tsx` — full picker over all 7 genomes (not just the one hardcoded one), `register-tilesets.sh` run over the full set (not ad hoc single-genome commands), reusing the row-group patterns from step 5. Worth resolving the high-zoom blanking bug before or during this step, since it'll affect every genome, not just the smoke-test one.
7. **(Stretch, optional)** PNG/PDF download button, live-vs-button picker UX decision, `/api/run-pipeline` route for triggering stage scripts from the UI — none of these block the immediate goal, so they can slip past it if time-constrained.

# Spec 003 — GC-Skew Window Config + GC Content

Stage 4 (`scripts/stage4_gc_skew.py`) previously derived its sliding-window size purely from genome length (`window ≈ length/1000`, `step ≈ window/5`). This spec replaces that with explicit, tuned window/step values per cluster, stored in a small config file rather than hardcoded, plus a new windowed GC-content metric in the same output.

Decisions locked in (confirmed with user):

- **Config file, not a code constant**: `scripts/gc_skew_config.json` holds a `clusters` map of explicit `{window, step}` overrides plus a `default` entry describing the auto-scale fallback formula:
  ```json
  {
    "default": { "mode": "auto", "window_divisor": 1000, "step_divisor": 5 },
    "clusters": {
      "bacteria": { "window": 1000, "step": 1000 },
      "mitogenome": { "window": 150, "step": 30 }
    }
  }
  ```
  Placed next to `stage4_gc_skew.py` (no top-level `config/` directory exists in this repo, and this file is currently consumed only by that one script).
- **Fixed values for the two current clusters**:

  | Cluster | Window | Step | Behavior |
  |---|---|---|---|
  | `bacteria` | 1000 bp | 1000 bp (= window) | Non-overlapping, tiled bins |
  | `mitogenome` | 150 bp | 30 bp | Overlapping sliding window |

- **Fallback for unlisted clusters**: any cluster not present in `clusters` uses `default`'s formula — `window = max(1, round(length / window_divisor))`, `step = max(1, round(window / step_divisor))` — identical to Stage 4's previous behavior. This means adding a new cluster (e.g. `bacteria_b`, `mitogenome_canine`) to the pipeline doesn't break Stage 4 even before anyone tunes window/step values for it; a maintainer can add a `clusters` entry for it later purely as a config edit, no code change.
- **Cluster discovery is a separate concern**: this config only affects Stage 4's windowing *once a cluster's genomes are already flowing through the pipeline*. Actually onboarding a new cluster still requires adding it to `INPUT_DIRS` in `scripts/stage1_parse.py` (`{"mitogenome": ..., "bacteria": ...}`) — that dict, not this config, is what determines which clusters exist and where their input `.gb` files live. Out of scope for this spec.
- **GC content**: windowed, computed over the same window/step as GC skew (not a separate metric with its own windowing), added as a **new trailing column** in the existing `<genome>_gc_skew.bedgraph` — column order `chrom, start, end, gc_skew, cumulative_gc_skew, gc_content`. Not a separate file, not a single whole-genome summary in `meta.json`.
  - Formula: `(G + C) / window_length` per window, using the window's actual base count as denominator.
- **Circular boundary wraparound**: every genome reaching Stage 4 is circular (Stage 1 excludes anything else), so a window running past the sequence end (`start + window > length`) wraps onto the start of the sequence rather than truncating — its G/C counts are pulled from `seq[start:length]` plus the wrapped remainder `seq[0:wrap]` where `wrap = (start + window) - length`. This keeps `gc_skew` and `gc_content` full-window-length even at the boundary, instead of the previous behavior where the last (and, for overlapping windows like mitogenome's, several trailing) windows shrank as they approached the sequence end.
  - The reported `end` coordinate stays **capped at `length`** regardless of wraparound (confirmed with user) — only the G/C counts feeding `gc_skew`/`gc_content` wrap, not the coordinate itself. This keeps every row's interval inside `[0, length]`, matching the chromosome bounds Gosling's `assembly`/`xDomain` expect; reporting `end > length` would put wrapped rows outside the declared coordinate space.
  - Cumulative GC skew needs no wraparound treatment — it's `running_diff[end-1]`, a single running pass over the sequence with no windowing edge case (consistent with Grigoriev 1998's original definition). When `end` is capped at `length` for several trailing overlapping windows (mitogenome's window=150 > step=30 means multiple boundary windows share the same capped `end`), those rows correctly report the same cumulative value — expected, since cumulative skew is a function of `end` alone, not of window/step.
  - Verified end-to-end against real data: for `C.diphtheriae_PRJEB24256` (length 3,060,363, window=step=1000) the final window's `gc_content` (0.539) exactly matches manually concatenating `seq[3060000:3060363]` + `seq[0:637]` and recomputing G/C fraction; for `B.exclamationis_MtDNA_MZ502489` (length 15,289, window=150/step=30) a mid-boundary wrapped window (`start=15270`) likewise matched a manual `seq[15270:15289] + seq[0:131]` computation (0.226667).

## Implementation

- `scripts/gc_skew_config.json` (new) — the config shown above.
- `scripts/stage4_gc_skew.py` — loads the config at module level; `resolve_window_step(cluster, length)` looks up the cluster's override or falls back to the default formula; `gc_skew_windows()` now returns 5-tuples including `gc_content`, with wraparound handling for windows that run past the sequence end on circular genomes; `write_gc_skew()` writes the 6-column bedgraph.
- `README.md` — Stage 4 section and Output File Summary table updated to describe the config-driven windows and the new column.
- `CLAUDE.md` — Stage 4 bullet updated to match.

## Open Items

- **Web app follow-up (not implemented in this spec)**: `web/lib/buildSpec.ts` hardcodes `headerNames: ['chrom', 'start', 'end', 'gc_skew', 'cumulative_gc_skew']` (in `gcSkewTracks()`, ~line 55) when parsing `<genome>_gc_skew.bedgraph`. It needs `gc_content` appended to that array, plus a new track (mark, color, height) to actually render it — analogous to the existing windowed-skew/cumulative-skew tracks. `web/components/trackStyles.ts` will need a color constant for it (alongside `GC_SKEW_POSITIVE_COLOR`, `GC_SKEW_NEGATIVE_COLOR`, `GC_SKEW_CUMULATIVE_COLOR`). Until this lands, the web app's existing tracks still work fine (it ignores the extra trailing column), but GC content itself isn't visualized yet.
- **Tuning `bacteria`/`mitogenome` values further**: the 1000 bp / 150 bp+30 bp values are the user's chosen starting points, not derived from a formal literature sweep. If a future cluster (`bacteria_b`, etc.) turns out to need very different genome sizes than the current *Corynebacterium*/Lepidoptera sets, its config entry may need separate tuning rather than reusing `bacteria`'s or `mitogenome`'s values verbatim.

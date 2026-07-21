# Understanding multivec `.h5` file

Notes from working through `scripts/stage5_sequence_track.py`'s bacterial branch — what one-hot encoding produces, what's actually stored in the `clodius` multivec pyramid, and how `h5py`/HDF5 works.

## Table of Contents

- [One-hot encoding: column order](#one-hot-encoding-column-order)
- [What HDF5 / h5py actually is](#what-hdf5--h5py-actually-is)
- [What's inside `<genome>.multires.h5`](#whats-inside-genomemultiresh5)
- [How the pyramid aggregation actually works](#how-the-pyramid-aggregation-actually-works)

## One-hot encoding: column order

`BASES = "ATGC"` fixes the column order as **A, T, G, C** (index 0–3) — not alphabetical, just the order the string is written in. `one_hot_encode()` builds one boolean column per base and stacks them:

```python
np.stack([seq_bytes == ord(base) for base in BASES], axis=1)
```

So each row is `[is_A, is_T, is_G, is_C]`:

| A | T | G | C | Base |
|---|---|---|---|---|
| 1 | 0 | 0 | 0 | A |
| 0 | 1 | 0 | 0 | T |
| 0 | 0 | 1 | 0 | G |
| 0 | 0 | 0 | 1 | C |

This exact order is recorded inside the `.h5` file as the `row_infos` attribute (`['A', 'T', 'G', 'C']`), so any downstream reader knows which column is which base without guessing.

## What HDF5 / h5py actually is

HDF5 is a binary file format — think of it as "a filesystem packed into a single file":

- **Groups** — like folders, can be nested.
- **Datasets** — like files inside those folders, each a typed, shaped array (e.g. "2,839,551 rows × 4 columns of float32").
- **Attributes** — small metadata tags attached to a group or dataset (like file properties), e.g. a label list.

`h5py` is the Python library that reads/writes this format. The practical payoff: you can open the file and read *just one slice* of one dataset (e.g. bases 50,000–51,024) without loading the other millions of rows into memory. That random-access property is what makes an `.h5` file usable as a static "tile source" — a viewer can fetch a small byte range instead of parsing a giant text file end to end.

## What's inside `<genome>.multires.h5`

Inspected directly with `h5py` on `C.callunae_DSC_20147_CP004354.multires.h5`:

```
/chroms/name     -> [b'CP004354.1']         (the one circular chromosome)
/chroms/length   -> [2839551]
/info            -> attrs: {'tile-size': 1024}
/resolutions/
    1/    (base resolution — one row per base)
        chroms/name, chroms/length     (same as above, repeated per resolution)
        values/CP004354.1              -> shape (2839551, 4), attrs: row_infos = ['A','T','G','C']
    2/    values/CP004354.1            -> shape (1419776, 4)
    4/    values/CP004354.1            -> shape (709888, 4)
    8/    ...
    ...
    4096/ values/CP004354.1            -> shape (694, 4)      (coarsest zoom level)
```

Mapping back to the arguments passed to `clodius.multivec.create_multivec_multires()` in [stage5_sequence_track.py](../scripts/stage5_sequence_track.py):

- `chromsizes=[(genome.accession, genome.length)]` -> becomes `/chroms/name` and `/chroms/length`, copied into every resolution group too (each resolution is self-describing).
- `starting_resolution=1` -> the key `"1"` under `/resolutions/`, holding the untouched one-hot data.
- `tile_size=1024` -> stored as the `tile-size` attribute in `/info`. It also controls how many zoom levels get built: the function keeps doubling the resolution (1, 2, 4, 8, …) until the whole genome fits in one tile of 1024 bins — for this 2.84 Mb genome that's 13 levels, up to 4096.
- `agg=lambda x: ...sum...` -> not stored in the file; it's the function used *while building* each new level from the one below it.
- `row_infos=[b'A', b'T', b'G', b'C']` -> stored as the `row_infos` attribute on every `/resolutions/N` group.
- `output_file` -> just the write path; not stored inside the file itself.

## How the pyramid aggregation actually works

Verified against real data: the first 8 one-hot rows at resolution 1 summed by hand to `[2, 1, 3, 2]` (2 A's, 1 T, 3 G's, 2 C's) — and that's exactly the first row stored at resolution 8.

Important nuance: the code does **not** jump straight from resolution 1 to resolution 8 by summing 8 rows in one go. It doubles step by step — 1→2, then 2→4, then 4→8 — pairing only **adjacent rows** from the level directly below each time:

```python
agg = lambda x: x.T.reshape((x.shape[1], -1, 2)).sum(axis=2).T
```

- `x.T` — flip from (positions, bases) to (bases, positions), so each base's row can be reshaped independently.
- `.reshape((4, -1, 2))` — chop each base's row of positions into groups of 2 adjacent bins.
- `.sum(axis=2)` — collapse each pair into 1 by adding.
- `.T` — flip back to (positions, bases).

Since addition doesn't care about grouping order, resolution 8's row ends up mathematically identical to "just add up 8 original rows" — but it's computed as three chained doublings, not one 8-way sum. This is also why the pyramid only ever has power-of-two resolutions (1, 2, 4, 8, 16, …) rather than, say, 3 or 5.

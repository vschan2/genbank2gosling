'use client';

import { useEffect, useState } from 'react';
import { GoslingComponent } from 'gosling.js';
import type { GoslingSpec } from 'gosling.js';

// Smoke-test only: one hardcoded bacterial genome's multivec track, no picker/manifest yet.
// Genome: C.callunae_DSC_20147_CP004354 (length 2,839,551 bp), tileset UID sanitized per
// higlass-server-ops's `.` -> `-` rule (see specs/spec-002-gosling-visualization.md).
const GENOME_LENGTH = 2839551;
const CHROM_NAME = 'CP004354.1';
const TILESET_UID = 'C-callunae_DSC_20147_CP004354';
const HIGLASS_SERVER = 'http://localhost:8989/api/v1';

const NUM_BASE_ROWS = 4; // A, T, G, C
const HEADER_RESERVED_PX = 120; // title + subtitle + axis space

function buildSpec(width: number, rowHeight: number): GoslingSpec {
    return {
        title: 'C. callunae DSM 20147 (CP004354.1)',
        subtitle: 'Bacterial multivec smoke test — sequence track only',
        // Explicit ChromSizes tuple (not the bare 'unknown' string) so Gosling knows the
        // true genome length when stitching tiles together — the bare string caused
        // rendering to go blank past the first multivec tile during panning/zooming.
        assembly: [[CHROM_NAME, GENOME_LENGTH]],
        layout: 'linear',
        xDomain: { interval: [0, GENOME_LENGTH] },
        tracks: [
            {
                width,
                // `height` here is the track's *total* rendered height, divided among the
                // `row` facet's categories (confirmed by reading drawBar's rowHeight =
                // trackHeight / rowCategories.length in gosling.js's compiled source) - not
                // multiplied per row as originally assumed. rowHeight is really only 1/4 of
                // `available` as a result, which happens to still look fine here since
                // `available` (full viewport height) leaves plenty of margin.
                height: rowHeight,
                data: {
                    type: 'multivec',
                    url: `${HIGLASS_SERVER}/tileset_info/?d=${TILESET_UID}`,
                    row: 'base',
                    column: 'position',
                    value: 'count',
                    categories: ['A', 'T', 'G', 'C']
                },
                mark: 'bar',
                x: { field: 'start', type: 'genomic' },
                xe: { field: 'end', type: 'genomic' },
                y: { field: 'count', type: 'quantitative' },
                row: { field: 'base', type: 'nominal' },
                color: { field: 'base', type: 'nominal' }
            }
        ]
    };
}

export default function BacterialSmokeTest() {
    const [dims, setDims] = useState<{ width: number; rowHeight: number } | null>(null);

    useEffect(() => {
        const computeDims = () => {
            const width = window.innerWidth;
            const available = window.innerHeight - HEADER_RESERVED_PX;
            const rowHeight = Math.max(20, Math.floor(available / NUM_BASE_ROWS));
            setDims({ width, rowHeight });
        };
        computeDims();
        window.addEventListener('resize', computeDims);
        return () => window.removeEventListener('resize', computeDims);
    }, []);

    if (!dims) return null;

    return <GoslingComponent spec={buildSpec(dims.width, dims.rowHeight)} />;
}

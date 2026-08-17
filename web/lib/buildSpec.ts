import type { GoslingSpec } from 'gosling.js';
import type { ClusterName, ManifestGenome } from './manifest';
import { toTilesetUid } from './manifest';
import {
    FEATURE_TYPES,
    FEATURE_COLORS,
    BASE_TYPES,
    BASE_COLORS,
    GC_SKEW_POSITIVE_COLOR,
    GC_SKEW_NEGATIVE_COLOR,
    GC_SKEW_CUMULATIVE_COLOR,
    TRACK_HEIGHTS
} from '@/components/trackStyles';

const MITOGENOME_LINKING_ID = 'mitogenome-x';
const BACTERIAL_LINKING_ID = 'bacterial-x';
const HIGLASS_SERVER = 'http://localhost:8989/api/v1';

function annotationsTrack(cluster: ClusterName, genome: ManifestGenome, width: number) {
    return {
        data: {
            type: 'csv' as const,
            url: `/api/genomes/${cluster}/${genome.id}/annotations.bed`,
            separator: '\t',
            chromosomeField: 'chrom',
            genomicFields: ['start', 'end'],
            headerNames: ['chrom', 'start', 'end', 'name', 'score', 'strand', 'type']
        },
        mark: 'rect' as const,
        x: { field: 'start', type: 'genomic' as const },
        xe: { field: 'end', type: 'genomic' as const },
        color: {
            field: 'type',
            type: 'nominal' as const,
            domain: [...FEATURE_TYPES],
            range: FEATURE_COLORS
        },
        tooltip: [
            { field: 'name', type: 'nominal' as const },
            { field: 'strand', type: 'nominal' as const },
            { field: 'type', type: 'nominal' as const }
        ],
        width,
        height: TRACK_HEIGHTS.annotation
    };
}

function gcSkewTracks(cluster: ClusterName, genome: ManifestGenome, width: number) {
    const data = {
        type: 'csv' as const,
        url: `/api/genomes/${cluster}/${genome.id}/gc_skew.bedgraph`,
        separator: '\t',
        chromosomeField: 'chrom',
        genomicFields: ['start', 'end'],
        headerNames: ['chrom', 'start', 'end', 'gc_skew', 'cumulative_gc_skew']
    };
    // Two separate slim tracks, not one overlaid dual-axis track: the two
    // series differ by orders of magnitude in range (gc_skew is roughly
    // -1..1, cumulative_gc_skew is an unbounded running sum), so sharing one
    // y-scale would flatten the windowed line to invisible.
    const windowedPositive = {
        data,
        mark: 'line' as const,
        x: { field: 'start', type: 'genomic' as const },
        xe: { field: 'end', type: 'genomic' as const },
        y: { field: 'gc_skew', type: 'quantitative' as const, domain: [0, 1], zeroBaseline: true },
        color: { value: GC_SKEW_POSITIVE_COLOR },
        width,
        height: TRACK_HEIGHTS.gcSkewWindowed
    };
    // `domain: [0, -1]` + `flip: true` (not `[-1, 0]`, no flip) is what puts
    // this track's zero-line at its *top* edge instead of its bottom:
    // `flip` reverses the y channel's pixel range to [rowHeight, 0]
    // (confirmed in gosling.js's compiled source), so with this domain,
    // value 0 lands at pixel 0 (top) and -1 lands at pixel rowHeight
    // (bottom). Stacked directly under windowedPositive - whose own zero
    // sits at its bottom edge - the two tracks' zero-lines meet at the
    // shared boundary, giving one continuous diverging skew line: positive
    // spikes up, negative spikes down from the same visual baseline.
    const windowedNegative = {
        data,
        mark: 'line' as const,
        x: { field: 'start', type: 'genomic' as const },
        xe: { field: 'end', type: 'genomic' as const },
        y: { field: 'gc_skew', type: 'quantitative' as const, domain: [0, -1], flip: true },
        color: { value: GC_SKEW_NEGATIVE_COLOR },
        width,
        height: TRACK_HEIGHTS.gcSkewWindowed
    };
    const cumulative = {
        data,
        mark: 'area' as const,
        x: { field: 'start', type: 'genomic' as const },
        xe: { field: 'end', type: 'genomic' as const },
        // Unbounded per-genome running sum, so domain can't be hardcoded like the
        // windowed track above -- disable zeroBaseline so Gosling falls back to the
        // actual [min, max] of this genome's data instead of clamping to [0, max].
        y: { field: 'cumulative_gc_skew', type: 'quantitative' as const, zeroBaseline: false },
        color: { value: GC_SKEW_CUMULATIVE_COLOR },
        width,
        height: TRACK_HEIGHTS.gcSkewCumulative
    };
    return [windowedPositive, windowedNegative, cumulative];
}

interface SequenceRecord {
    chrom: string;
    start: number;
    end: number;
    base: string;
}

function sequenceTrack(values: SequenceRecord[], width: number) {
    return {
        alignment: 'overlay' as const,
        data: {
            type: 'json' as const,
            values,
            chromosomeField: 'chrom',
            genomicFields: ['start', 'end']
        },
        tracks: [
            { mark: 'rect' as const },
            {
                mark: 'text' as const,
                size: { value: 24 },
                color: { value: 'white' },
                // Semantic zoom, matching gosling.js.org/?example=SEQUENCE: letters only
                // render once a base's cell is wide enough to hold one (width rule) AND
                // the view is zoomed in close enough to be useful (zoomLevel rule, which
                // also skips the text-layout cost while zoomed out).
                visibility: [
                    {
                        operation: 'less-than' as const,
                        measure: 'width' as const,
                        threshold: '|xe-x|' as const,
                        transitionPadding: 30,
                        target: 'mark' as const
                    },
                    {
                        operation: 'LT' as const,
                        measure: 'zoomLevel' as const,
                        threshold: 40,
                        target: 'track' as const
                    }
                ]
            }
        ],
        x: { field: 'start', type: 'genomic' as const },
        xe: { field: 'end', type: 'genomic' as const },
        text: { field: 'base', type: 'nominal' as const },
        color: {
            field: 'base',
            type: 'nominal' as const,
            domain: [...BASE_TYPES],
            range: BASE_COLORS,
            legend: true
        },
        style: { textFontWeight: 'bold' as const },
        width,
        height: TRACK_HEIGHTS.sequence
    };
}

async function fetchSequence(genomeId: string): Promise<SequenceRecord[]> {
    const res = await fetch(`/api/genomes/mitogenome_cluster/${genomeId}/sequence.json`);
    if (!res.ok) {
        throw new Error(`Failed to load sequence for ${genomeId}: ${res.status}`);
    }
    return res.json();
}

export async function buildMitogenomeSpec(genomes: ManifestGenome[], width: number): Promise<GoslingSpec> {
    const sequences = await Promise.all(genomes.map(g => fetchSequence(g.id)));

    const views = genomes.map((genome, i) => ({
        layout: 'linear' as const,
        width,
        linkingId: MITOGENOME_LINKING_ID,
        title: genome.organism,
        subtitle: genome.accession,
        assembly: [[genome.accession, genome.length]] as [string, number][],
        xDomain: { interval: [0, genome.length] as [number, number] },
        tracks: [
            annotationsTrack('mitogenome_cluster', genome, width),
            ...gcSkewTracks('mitogenome_cluster', genome, width),
            sequenceTrack(sequences[i], width)
        ]
    }));

    return {
        arrangement: 'vertical',
        views
    };
}

// Multivec tiles are fetched by Gosling directly from higlass-server, not
// proxied through the Next.js API route (unlike annotations/gc_skew above).
// Gosling's MultivecData type has no separate server/tilesetUid fields, just
// a combined `url` built from the sanitized (dot-free) tileset UID - see
// register-tilesets.sh and toTilesetUid()'s doc comment in manifest.ts.
//
// Semantic zoom, mirroring gosling.js's own "sequence" example: no `row`
// facet, so all 4 bases stack into one lane. Zoomed out that reads as a
// composition/proportion bar chart; zoomed in to ~1bp/column it collapses
// to a solid color block per base, with its letter overlaid.
function multivecTrack(genome: ManifestGenome, width: number) {
    return {
        alignment: 'overlay' as const,
        data: {
            type: 'multivec' as const,
            url: `${HIGLASS_SERVER}/tileset_info/?d=${toTilesetUid(genome.id)}`,
            row: 'base',
            column: 'position',
            value: 'count',
            categories: [...BASE_TYPES]
        },
        tracks: [
            { mark: 'bar' as const, y: { field: 'count', type: 'quantitative' as const } },
            {
                // Without this filter, Gosling draws a text mark for all 4
                // A/T/G/C matrix rows at every position (there's no `row` facet
                // to spatially separate them), so 3 zero-count letters overlap
                // the real one. Matches web/temp/sequence.json's reference
                // pattern for the same multivec-derived sequence track.
                dataTransform: [{ type: 'filter' as const, field: 'count', oneOf: [0], not: true }],
                mark: 'text' as const,
                size: { value: 24 },
                color: { value: 'white' },
                // Same semantic-zoom rule as the mitogenome sequenceTrack: letters
                // only render once a base's cell is wide enough to hold one (width
                // rule) AND the view is zoomed in close enough to be useful
                // (zoomLevel rule, which also skips text-layout cost while zoomed out).
                visibility: [
                    {
                        operation: 'less-than' as const,
                        measure: 'width' as const,
                        threshold: '|xe-x|' as const,
                        transitionPadding: 30,
                        target: 'mark' as const
                    },
                    {
                        operation: 'LT' as const,
                        measure: 'zoomLevel' as const,
                        threshold: 40,
                        target: 'track' as const
                    }
                ]
            }
        ],
        x: { field: 'start', type: 'genomic' as const },
        xe: { field: 'end', type: 'genomic' as const },
        text: { field: 'base', type: 'nominal' as const },
        color: { field: 'base', type: 'nominal' as const, domain: [...BASE_TYPES], range: BASE_COLORS },
        style: { textFontWeight: 'bold' as const },
        width,
        height: TRACK_HEIGHTS.multivec
    };
}

export function buildBacterialSpec(genomes: ManifestGenome[], width: number): GoslingSpec {
    const views = genomes.map(genome => ({
        layout: 'linear' as const,
        width,
        linkingId: BACTERIAL_LINKING_ID,
        title: genome.organism,
        subtitle: genome.accession,
        // Explicit ChromSizes tuple (not the bare 'unknown' string) - required for
        // Gosling to know the true genome length when stitching multivec tiles
        // together, confirmed during the bacterial smoke test.
        assembly: [[genome.accession, genome.length]] as [string, number][],
        xDomain: { interval: [0, genome.length] as [number, number] },
        tracks: [
            annotationsTrack('bacterial_cluster', genome, width),
            ...gcSkewTracks('bacterial_cluster', genome, width),
            multivecTrack(genome, width)
        ]
    }));

    return {
        arrangement: 'vertical',
        views
    };
}

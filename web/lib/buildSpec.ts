import type { GoslingSpec } from 'gosling.js';
import type { ManifestGenome } from './manifest';
import {
    FEATURE_TYPES,
    FEATURE_COLORS,
    BASE_TYPES,
    BASE_COLORS,
    GC_SKEW_WINDOWED_COLOR,
    GC_SKEW_CUMULATIVE_COLOR,
    TRACK_HEIGHTS
} from '@/components/trackStyles';

const LINKING_ID = 'mitogenome-x';

function annotationsTrack(genome: ManifestGenome, width: number) {
    return {
        data: {
            type: 'csv' as const,
            url: `/api/genomes/mitogenome_cluster/${genome.id}/annotations.bed`,
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

function gcSkewTracks(genome: ManifestGenome, width: number) {
    const data = {
        type: 'csv' as const,
        url: `/api/genomes/mitogenome_cluster/${genome.id}/gc_skew.bedgraph`,
        separator: '\t',
        chromosomeField: 'chrom',
        genomicFields: ['start', 'end'],
        headerNames: ['chrom', 'start', 'end', 'gc_skew', 'cumulative_gc_skew']
    };
    // Two separate slim tracks, not one overlaid dual-axis track: the two
    // series differ by orders of magnitude in range (gc_skew is roughly
    // -1..1, cumulative_gc_skew is an unbounded running sum), so sharing one
    // y-scale would flatten the windowed line to invisible.
    const windowed = {
        data,
        mark: 'line' as const,
        x: { field: 'start', type: 'genomic' as const },
        xe: { field: 'end', type: 'genomic' as const },
        y: { field: 'gc_skew', type: 'quantitative' as const },
        color: { value: GC_SKEW_WINDOWED_COLOR },
        width,
        height: TRACK_HEIGHTS.gcSkewWindowed
    };
    const cumulative = {
        data,
        mark: 'area' as const,
        x: { field: 'start', type: 'genomic' as const },
        xe: { field: 'end', type: 'genomic' as const },
        y: { field: 'cumulative_gc_skew', type: 'quantitative' as const },
        color: { value: GC_SKEW_CUMULATIVE_COLOR },
        width,
        height: TRACK_HEIGHTS.gcSkewCumulative
    };
    return [windowed, cumulative];
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
                color: { value: 'white' },
                visibility: [
                    {
                        operation: 'less-than' as const,
                        measure: 'width' as const,
                        threshold: '|xe-x|' as const,
                        transitionPadding: 30,
                        target: 'mark' as const
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
            range: BASE_COLORS
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
        linkingId: LINKING_ID,
        title: genome.organism,
        subtitle: genome.accession,
        assembly: [[genome.accession, genome.length]] as [string, number][],
        xDomain: { interval: [0, genome.length] as [number, number] },
        tracks: [annotationsTrack(genome, width), ...gcSkewTracks(genome, width), sequenceTrack(sequences[i], width)]
    }));

    return {
        arrangement: 'vertical',
        views
    };
}

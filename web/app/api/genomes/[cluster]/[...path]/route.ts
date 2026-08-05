import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';

// Pipeline output (`../output/<cluster>/...`) is gitignored and lives outside
// `web/` - read it server-side here so the browser only ever talks to this
// same-origin route, never `../output/` directly (Next's dev server can't
// serve an arbitrary sibling directory anyway).
const CLUSTERS = new Set(['mitogenome_cluster', 'bacterial_cluster']);
const OUTPUT_ROOT = path.join(process.cwd(), '..', 'output');

const PER_GENOME_FILES: Record<string, string> = {
    'annotations.bed': 'annotations.bed',
    'gc_skew.bedgraph': 'gc_skew.bedgraph',
    'sequence.json': 'sequence.json'
};

const CONTENT_TYPES: Record<string, string> = {
    '.json': 'application/json',
    '.bed': 'text/plain',
    '.bedgraph': 'text/plain'
};

export async function GET(_req: Request, { params }: { params: { cluster: string; path: string[] } }) {
    const { cluster, path: pathSegments } = params;

    if (!CLUSTERS.has(cluster)) {
        return NextResponse.json({ error: 'unknown cluster' }, { status: 404 });
    }

    let relativePath: string;
    if (pathSegments.length === 1 && pathSegments[0] === 'manifest.json') {
        relativePath = 'manifest.json';
    } else if (pathSegments.length === 2) {
        const [genomeId, filename] = pathSegments;
        const suffix = PER_GENOME_FILES[filename];
        if (!suffix || genomeId.includes('..') || genomeId.includes('/')) {
            return NextResponse.json({ error: 'not found' }, { status: 404 });
        }
        relativePath = path.join(genomeId, `${genomeId}_${suffix}`);
    } else {
        return NextResponse.json({ error: 'not found' }, { status: 404 });
    }

    const clusterRoot = path.join(OUTPUT_ROOT, cluster);
    const filePath = path.join(clusterRoot, relativePath);

    // Defense in depth beyond the filename whitelist above.
    if (filePath !== clusterRoot && !filePath.startsWith(clusterRoot + path.sep)) {
        return NextResponse.json({ error: 'invalid path' }, { status: 400 });
    }

    try {
        const contents = await readFile(filePath, 'utf-8');
        const ext = path.extname(filePath);
        return new NextResponse(contents, {
            headers: { 'Content-Type': CONTENT_TYPES[ext] ?? 'text/plain' }
        });
    } catch {
        return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
}

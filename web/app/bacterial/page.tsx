'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import type { GoslingSpec } from 'gosling.js';
import GenomePicker from '@/components/GenomePicker';
import { fetchManifest, type ManifestGenome } from '@/lib/manifest';
import { buildBacterialSpec } from '@/lib/buildSpec';
import { useViewportWidth } from '@/lib/useViewportWidth';

const ClusterView = dynamic(() => import('@/components/ClusterView'), { ssr: false });

export default function BacterialPage() {
    const [genomes, setGenomes] = useState<ManifestGenome[]>([]);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [spec, setSpec] = useState<GoslingSpec | null>(null);
    const width = useViewportWidth();

    useEffect(() => {
        fetchManifest('bacterial_cluster').then(manifest => setGenomes(manifest.genomes));
    }, []);

    // Explicit "Generate view" button rather than the mitogenome page's live
    // re-render: bacterial genomes load a multivec tile pyramid per genome
    // (MB-scale, fetched from higlass-server over the network) rather than a
    // KB-sized inline JSON array, so re-rendering on every checkbox click
    // risks feeling laggy with several genomes selected at once.
    const generate = () => {
        if (!width || selected.size === 0) {
            setSpec(null);
            return;
        }
        const chosen = genomes.filter(g => selected.has(g.id));
        setSpec(buildBacterialSpec(chosen, width));
    };

    return (
        <main style={{ padding: 16 }}>
            <h1>Bacterial cluster</h1>
            <p>Requires higlass-server running at localhost:8989 (see higlass-server-ops/run-server.sh).</p>
            <GenomePicker genomes={genomes} selected={selected} onChange={setSelected} />
            <button onClick={generate} disabled={selected.size === 0} style={{ margin: '12px 0' }}>
                Generate view
            </button>
            {selected.size === 0 && <p>Select at least one genome to render a view.</p>}
            <ClusterView spec={spec} />
        </main>
    );
}

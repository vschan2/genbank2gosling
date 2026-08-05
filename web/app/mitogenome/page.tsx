'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import type { GoslingSpec } from 'gosling.js';
import GenomePicker from '@/components/GenomePicker';
import { fetchManifest, type ManifestGenome } from '@/lib/manifest';
import { buildMitogenomeSpec } from '@/lib/buildSpec';
import { useViewportWidth } from '@/lib/useViewportWidth';

const ClusterView = dynamic(() => import('@/components/ClusterView'), { ssr: false });

export default function MitogenomePage() {
    const [genomes, setGenomes] = useState<ManifestGenome[]>([]);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [spec, setSpec] = useState<GoslingSpec | null>(null);
    const width = useViewportWidth();

    useEffect(() => {
        fetchManifest('mitogenome_cluster').then(manifest => setGenomes(manifest.genomes));
    }, []);

    // Live re-render on every checkbox change: mitogenome files are small
    // (KB-sized BED/bedgraph/sequence JSON), so re-fetching on each toggle
    // hasn't shown to feel janky. Revisit if the bacterial page (much larger
    // multivec loads) needs an explicit "Generate view" button instead.
    useEffect(() => {
        if (!width || selected.size === 0) {
            setSpec(null);
            return;
        }
        const chosen = genomes.filter(g => selected.has(g.id));
        let cancelled = false;
        buildMitogenomeSpec(chosen, width).then(built => {
            if (!cancelled) setSpec(built);
        });
        return () => {
            cancelled = true;
        };
    }, [genomes, selected, width]);

    return (
        <main style={{ padding: 16 }}>
            <h1>Mitogenome cluster</h1>
            <GenomePicker genomes={genomes} selected={selected} onChange={setSelected} />
            {selected.size === 0 && <p>Select at least one genome to render a view.</p>}
            <ClusterView spec={spec} />
        </main>
    );
}

'use client';

import type { ManifestGenome } from '@/lib/manifest';

interface GenomePickerProps {
    genomes: ManifestGenome[];
    selected: Set<string>;
    onChange: (selected: Set<string>) => void;
}

export default function GenomePicker({ genomes, selected, onChange }: GenomePickerProps) {
    const toggle = (id: string) => {
        const next = new Set(selected);
        if (next.has(id)) {
            next.delete(id);
        } else {
            next.add(id);
        }
        onChange(next);
    };

    return (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {genomes.map(genome => (
                <li key={genome.id} style={{ padding: '4px 0' }}>
                    <label style={{ display: 'flex', alignItems: 'baseline', gap: 8, cursor: 'pointer' }}>
                        <input
                            type="checkbox"
                            checked={selected.has(genome.id)}
                            onChange={() => toggle(genome.id)}
                        />
                        <span>
                            {genome.organism}
                            <span style={{ color: '#898781', marginLeft: 6, fontSize: '0.85em' }}>
                                {genome.accession}
                            </span>
                        </span>
                    </label>
                </li>
            ))}
        </ul>
    );
}

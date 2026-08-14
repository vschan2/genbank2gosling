export type ClusterName = 'mitogenome_cluster' | 'bacterial_cluster';

export interface ManifestGenome {
    id: string;
    organism: string;
    accession: string;
    length: number;
}

export interface Manifest {
    cluster: ClusterName;
    genomes: ManifestGenome[];
}

export async function fetchManifest(cluster: ClusterName): Promise<Manifest> {
    const res = await fetch(`/api/genomes/${cluster}/manifest.json`);
    if (!res.ok) {
        throw new Error(`Failed to load manifest for ${cluster}: ${res.status}`);
    }
    return res.json();
}

// higlass-server's tile-serving endpoint splits a requested tile ID on '.' and
// takes the first segment as the tileset UUID, so a manifest id containing a
// period (every bacterial genome, from the "Genus-abbrev.species" naming
// convention) breaks tile lookups unless sanitized. register-tilesets.sh
// applies this same '.' -> '-' transform when registering each tileset -
// centralized here so buildSpec.ts can't drift out of sync with it.
export function toTilesetUid(id: string): string {
    return id.replace(/\./g, '-');
}

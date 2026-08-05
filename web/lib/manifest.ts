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

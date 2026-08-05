'use client';

import { GoslingComponent } from 'gosling.js';
import type { GoslingSpec } from 'gosling.js';

interface ClusterViewProps {
    spec: GoslingSpec | null;
}

// PNG/PDF export button (gosling-react's api.exportPng()/exportPdf() via a
// ref) is deferred to implementation-order step 7 - not needed yet.
export default function ClusterView({ spec }: ClusterViewProps) {
    if (!spec) return null;
    return <GoslingComponent spec={spec} />;
}

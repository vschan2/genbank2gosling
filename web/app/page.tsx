'use client';

import dynamic from 'next/dynamic';

const BacterialSmokeTest = dynamic(() => import('@/components/BacterialSmokeTest'), {
    ssr: false
});

export default function Home() {
    return <BacterialSmokeTest />;
}

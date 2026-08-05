import { useEffect, useState } from 'react';

// Gosling renders to a fixed-pixel canvas, not a CSS-responsive element, so
// track widths must be computed from the viewport rather than passed as "100%".
export function useViewportWidth(): number | null {
    const [width, setWidth] = useState<number | null>(null);

    useEffect(() => {
        const update = () => setWidth(window.innerWidth - 32); // leave a small page margin
        update();
        window.addEventListener('resize', update);
        return () => window.removeEventListener('resize', update);
    }, []);

    return width;
}

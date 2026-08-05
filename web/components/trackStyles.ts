// Shared feature-type -> color mapping, reused across every genome in both
// clusters (mitogenome + bacterial) so e.g. CDS reads as the same color
// regardless of which genomes are currently selected. The 8 named hues are
// the validated categorical order from the dataviz skill's reference
// palette (fixed order, never cycled/reassigned). Combined across both
// clusters there are 9 distinct BED feature types; `repeat_region` (rarest,
// bacterial-only) folds into the neutral "Other" bucket rather than
// consuming a 9th hue.
export const FEATURE_TYPES = [
    'gene',
    'CDS',
    'tRNA',
    'rRNA',
    'misc_feature',
    'ncRNA',
    'tmRNA',
    'D-loop',
    'repeat_region'
] as const;

export const OTHER_FEATURE_COLOR = '#898781'; // catch-all (e.g. repeat_region)

export const FEATURE_COLORS = [
    '#2a78d6', // gene - blue
    '#eb6834', // CDS - orange
    '#1baf7a', // tRNA - aqua
    '#eda100', // rRNA - yellow
    '#e87ba4', // misc_feature - magenta
    '#008300', // ncRNA - green
    '#4a3aa7', // tmRNA - violet
    '#e34948', // D-loop - red
    OTHER_FEATURE_COLOR // repeat_region - Other
];

export const BASE_TYPES = ['A', 'T', 'G', 'C'] as const;
export const BASE_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100'];

// GC-skew windowed vs. cumulative are rendered as two separate slim tracks
// (not one overlaid dual-axis track - the two series differ by orders of
// magnitude in range, and superimposing them on one y-scale is a dual-axis
// chart, which misrepresents relative magnitude). Each keeps its own single
// y-scale and its own categorical-slot color for consistent identity.
export const GC_SKEW_WINDOWED_COLOR = '#2a78d6';
export const GC_SKEW_CUMULATIVE_COLOR = '#eb6834';

export const TRACK_HEIGHTS = {
    annotation: 40,
    gcSkewWindowed: 40,
    gcSkewCumulative: 40,
    sequence: 24
};

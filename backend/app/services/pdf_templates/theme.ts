export interface Theme {
  primary: string;
  accent: string;
  text: string;
  muted: string;
  border: string;
  background: string;
  rowAlt: string;

  fontHeader: 'Helvetica-Bold' | 'Times-Bold' | 'Courier-Bold';
  fontBody: 'Helvetica' | 'Times-Roman' | 'Courier';
  fontMono: 'Courier' | 'Courier-Bold';

  density: 'compact' | 'normal' | 'spacious';
  showAmountInWords: boolean;
}

export const DEFAULT_THEME: Theme = {
  primary: '#1e3a8a',
  accent: '#2563eb',
  text: '#111827',
  muted: '#6b7280',
  border: '#e5e7eb',
  background: '#ffffff',
  rowAlt: '#f9fafb',
  fontHeader: 'Helvetica-Bold',
  fontBody: 'Helvetica',
  fontMono: 'Courier',
  density: 'normal',
  showAmountInWords: true,
};

export function mergeTheme(override: Partial<Theme> = {}): Theme {
  return { ...DEFAULT_THEME, ...override };
}

export interface DensityMetrics {
  rowHeight: number;
  fontSize: number;
  sectionGap: number;
  pad: number;
}

export function densityMetrics(density: Theme['density']): DensityMetrics {
  switch (density) {
    case 'compact':  return { rowHeight: 13, fontSize: 8,  sectionGap: 8,  pad: 3 };
    case 'spacious': return { rowHeight: 22, fontSize: 10, sectionGap: 18, pad: 6 };
    default:         return { rowHeight: 16, fontSize: 9,  sectionGap: 12, pad: 4 };
  }
}

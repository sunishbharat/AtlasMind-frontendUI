// Central feature-flag store. Import once, use anywhere.
// Flags persist to localStorage so they survive page reloads.

const STORAGE_KEY = 'atlasmind:features';

interface ChartFeatures {
  enabled: boolean;
  autoDerive: boolean;
  defaultType: string;
  animation: boolean;
  maxItems: number;
}

interface SavedFeatures {
  charts?: Partial<ChartFeatures>;
}

function loadSaved(): SavedFeatures {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as SavedFeatures;
  } catch {
    return {};
  }
}

class FeaturesStore {
  charts = $state<ChartFeatures>({
    enabled: true,
    autoDerive: true,
    defaultType: 'bar',
    animation: true,
    maxItems: 20,
  });

  constructor() {
    const saved = loadSaved();
    if (saved.charts) Object.assign(this.charts, saved.charts);
  }

  /** Flip a module's master switch and persist. */
  toggle(module: 'charts'): void {
    this[module].enabled = !this[module].enabled;
    this.persist();
  }

  /** Call after any manual flag mutation to write to localStorage. */
  persist(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ charts: this.charts }));
  }
}

export const features = new FeaturesStore();

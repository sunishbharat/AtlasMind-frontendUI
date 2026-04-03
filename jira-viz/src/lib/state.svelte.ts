// Shared reactive state - accessible by any view component

export class VizState {
  hoveredId = $state<string | null>(null);
}

export const vizState = new VizState();

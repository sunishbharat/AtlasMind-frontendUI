// Shared reactive state — accessible by any view component

export class VizState {
  hoveredId = $state(null)
}

export const vizState = new VizState()

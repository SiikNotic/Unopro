let support: boolean | null = null;

/** WebGL present (checked once). */
export function canUse3D(): boolean {
  if (support === null) {
    try {
      const c = document.createElement('canvas');
      support = !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch {
      support = false;
    }
  }
  return support;
}

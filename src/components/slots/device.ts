/** A modest device (few cores or little memory): the costly ambient effects are dropped. */
export function isLiteDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const cores = navigator.hardwareConcurrency ?? 8;
  const memory = (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 8;
  return cores <= 4 || memory <= 4;
}


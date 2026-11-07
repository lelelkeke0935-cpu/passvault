import type {Stage, StageState} from './types';

export function validCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

export function blockedLabel(value: unknown): string {
  return validCount(value) && value > 0 ? `已擋下 ${value} 次` : '';
}

// Denied plays for six seconds, then allows two seconds for the retry event.
export function endingElapsed(state: StageState, elapsed: number): number | null {
  const start = state === 'locked' ? 4 : state === 'denied' ? 8 : Infinity;
  return elapsed >= start ? elapsed - start : null;
}

export function bridgeAngle(state: StageState, elapsed: number, reduced: boolean): number {
  if (state !== 'locked') return 0;
  const progress = reduced ? 1 : Math.max(0, Math.min(1, (elapsed - .45) / 1.7));
  return progress === 0 ? 0 : -66 * Math.PI / 180 * (1 - (1 - progress) ** 3);
}

export function closingCounts(stage: Stage): [number, number, number] | null {
  return validCount(stage.blockedCount) && validCount(stage.allowedCount)
    ? [0, stage.blockedCount, stage.allowedCount] : null;
}

export function closingPhase(elapsed: number, hasCounts: boolean): 'settle'|'numbers'|'brand'|'contact' {
  if (elapsed < 1.6) return 'settle';
  // Kyle 11-07: the demo itself ends at 50-55 s, then the contact QR adds 5-10 s.
  if (hasCounts && elapsed < 5.1) return 'numbers';
  if (elapsed < 11.6) return 'brand';
  // Kyle 11-07: after the brand, a contact screen with a mail QR stays up so the audience can scan it.
  return 'contact';
}

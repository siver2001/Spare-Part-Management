import { SparePart } from '@/types';

export function isBelowSafety(part: SparePart) {
  return part.currentStockOk < part.safetyStockOk;
}

export function isCriticalPart(part: SparePart) {
  return part.currentStockOk <= part.minStock;
}

export function getSafetyGap(part: SparePart) {
  return Math.max(part.safetyStockOk - part.currentStockOk, 0);
}

export function getSuggestedReorder(part: SparePart) {
  const gap = getSafetyGap(part);

  if (gap === 0) {
    return 0;
  }

  return Math.max(gap, part.reorderQuantity || 0);
}

export function sortBySafetyRisk(a: SparePart, b: SparePart) {
  const criticalDelta = Number(isCriticalPart(b)) - Number(isCriticalPart(a));

  if (criticalDelta !== 0) {
    return criticalDelta;
  }

  const gapDelta = getSafetyGap(b) - getSafetyGap(a);

  if (gapDelta !== 0) {
    return gapDelta;
  }

  const aCoverage = a.safetyStockOk > 0 ? a.currentStockOk / a.safetyStockOk : Number.POSITIVE_INFINITY;
  const bCoverage = b.safetyStockOk > 0 ? b.currentStockOk / b.safetyStockOk : Number.POSITIVE_INFINITY;

  if (aCoverage !== bCoverage) {
    return aCoverage - bCoverage;
  }

  return a.partName.localeCompare(b.partName);
}

export function getPartsBelowSafety(parts: SparePart[]) {
  return [...parts].filter(isBelowSafety).sort(sortBySafetyRisk);
}

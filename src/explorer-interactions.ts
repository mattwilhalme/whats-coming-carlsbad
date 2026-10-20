export const PANEL_STOPS = [20, 50, 65] as const;
export function clampMapShare(value: number) {
  return Math.max(20, Math.min(65, value));
}
export function nearestPanelStop(value: number) {
  return PANEL_STOPS.reduce((best, stop) => Math.abs(stop - value) < Math.abs(best - value) ? stop : best, 50 as number);
}
export function nearestCardIndex(centers: number[], viewportCenter: number) {
  if (!centers.length) return -1;
  return centers.reduce((best, center, index) => Math.abs(center - viewportCenter) < Math.abs(centers[best] - viewportCenter) ? index : best, 0);
}

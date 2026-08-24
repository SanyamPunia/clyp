/** Preview zoom. Affects the canvas only: the export always renders at 1x. */

export const ZOOM_STEPS = [
  0.1, 0.15, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 3, 4,
];

export const MIN_ZOOM = ZOOM_STEPS[0];
export const MAX_ZOOM = ZOOM_STEPS[ZOOM_STEPS.length - 1];

export function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

/** Next step up the ladder, or the same value at the ceiling. */
export function zoomIn(current: number): number {
  return ZOOM_STEPS.find((step) => step > current + 0.001) ?? MAX_ZOOM;
}

/** Next step down the ladder, or the same value at the floor. */
export function zoomOut(current: number): number {
  const below = ZOOM_STEPS.filter((step) => step < current - 0.001);
  return below.length ? below[below.length - 1] : MIN_ZOOM;
}

/** Largest zoom that fits `content` inside `view`, never magnifying past 1x. */
export function zoomToFit(
  view: { width: number; height: number },
  content: { width: number; height: number },
  padding: number
): number {
  if (!content.width || !content.height) return 1;
  return clampZoom(
    Math.min(
      (view.width - padding) / content.width,
      (view.height - padding) / content.height,
      1
    )
  );
}

export function formatZoom(value: number): string {
  return `${Math.round(value * 100)}%`;
}

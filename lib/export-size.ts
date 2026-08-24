/**
 * Export size estimate.
 *
 * Measured from real exports of this app rather than guessed. Bytes per pixel
 * is not constant: it falls as the output grows, because smooth gradients and
 * flat UI compress better at higher resolution. Samples of the same artwork:
 *
 *   plain  1x  1.27 Mpx  0.0732 B/px
 *   plain  2x  5.09 Mpx  0.0573 B/px
 *   plain  3x 11.45 Mpx  0.0519 B/px
 *   grain  1x  1.27 Mpx  0.2447 B/px
 *   grain  2x  5.09 Mpx  0.2029 B/px
 *
 * Both series fit a power law, so the coefficients below are least-squares
 * fits over those points. Content still varies by roughly a fifth either way,
 * which is why the figure is always shown as an approximation.
 */
const FIT = {
  plain: { coefficient: 0.7985, exponent: 0.17 },
  grain: { coefficient: 1.6324, exponent: 0.135 },
};

/** Exact output pixels. `toPng` multiplies the frame by the chosen scale. */
export function outputSize(
  frame: { width: number; height: number },
  scale: number
): { width: number; height: number } {
  return {
    width: Math.round(frame.width * scale),
    height: Math.round(frame.height * scale),
  };
}

export function estimateBytes(
  width: number,
  height: number,
  hasGrain: boolean
): number {
  const pixels = width * height;
  if (!pixels) return 0;

  const { coefficient, exponent } = hasGrain ? FIT.grain : FIT.plain;
  return pixels * coefficient * Math.pow(pixels, -exponent);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  // Switch to MB a little before the binary boundary, so the readout never
  // shows an awkward four-digit "1009 KB".
  if (bytes < 1000 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

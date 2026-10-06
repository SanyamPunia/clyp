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

/**
 * Video size estimate.
 *
 * Measured from real exports of this app, the same way the PNG fit above was.
 * The surprise is that bytes track the output's *linear* size rather than its
 * pixel count: mediabunny drives an AVC encode from a quantizer rather than a
 * bitrate, so the detail in the frame is fixed by the source clip and a larger
 * output only spreads it. Doubling the scale quadruples the pixels and roughly
 * doubles the file.
 *
 * Bytes per root pixel per second, over three clips at three scales:
 *
 *   moving UI  1x  1.24 Mpx  67.7      still UI  1x  1.24 Mpx  35.7
 *   moving UI  2x  4.95 Mpx  68.7      still UI  2x  4.95 Mpx  33.7
 *   test card  1x  0.40 Mpx  43.0      test card  2x  1.59 Mpx  43.6
 *   test card  3x  3.58 Mpx  50.1
 *
 * So the constant holds across scale to within a few percent and the spread is
 * all content: a static screen recording is around 35 and one panning a whole
 * window is around 69. The figure below is the middle of that, which is why
 * the readout is always shown as an approximation.
 */
const VIDEO_BYTES_PER_ROOT_PIXEL_SECOND = 50;

/**
 * What doubling the frame rate costs. Measured, and well under two, because
 * frames half as far apart have that much more in common and a
 * quantizer-driven encode spends less on each of them.
 *
 *   panning UI    1x  236 KB -> 283 KB   1.20
 *   panning UI    2x  540 KB -> 638 KB   1.18
 *   test pattern  1x  139 KB -> 230 KB   1.65
 *
 * The spread is content, the same way the base constant's is: a UI that moves
 * a little gains almost nothing from the extra frames, and a field of detail
 * in constant motion gains a lot. Encode time was steadier at about 1.22 for
 * every sample.
 */
const VIDEO_60_FPS_FACTOR = 1.4;

export function estimateVideoBytes(
  width: number,
  height: number,
  seconds: number,
  fps = 30
): number {
  const pixels = width * height;
  if (!pixels || !seconds) return 0;

  return (
    VIDEO_BYTES_PER_ROOT_PIXEL_SECOND *
    Math.sqrt(pixels) *
    seconds *
    (fps > 30 ? VIDEO_60_FPS_FACTOR : 1)
  );
}

/**
 * Size estimate for anything over a moving background: an image written as a
 * loop, or a clip.
 *
 * Fitted separately because it behaves unlike a recording. The whole frame
 * changes every frame, so the file tracks the pixel count, not the linear
 * size: bytes go as pixels to about 0.88. Measured on 12 s loops of a
 * 480x300 picture with 64px of padding, at 30 fps, in bytes per second:
 *
 *               1x 0.26 Mpx   2x 1.04 Mpx   3x 2.34 Mpx
 *   Daydream       80,200       241,400       483,300
 *   Inkwell        62,200       179,500       351,300
 *   Nightshade    106,500       395,400       845,700
 *   Seagrass      106,200       394,500       847,800
 *
 * Over pixels^0.88 that is 0.9 to 2.1, flows low and warps high, so the
 * coefficient is the middle. 60 fps cost 1.5x for a flow and 2x for a warp,
 * which is far over a recording's 1.4: a moving field shares less between
 * frames than a screen does.
 *
 * A clip over one lands in the same range, since the field is most of what
 * changes: the six-colour fixture at 768x488 and 30 fps wrote 0.30 bytes per
 * pixel-second over Daydream and 0.46 over Nightshade, against 0.07 over
 * Golden Hour. The constant before this fit was the recording's,
 * and it read 837 KB for files of 6 to 9 MB.
 */
const LOOP_COEFFICIENT = 1.4;
const LOOP_EXPONENT = 0.88;
const LOOP_60_FPS_FACTOR = 1.7;

export function estimateMovingBytes(
  width: number,
  height: number,
  seconds: number,
  fps = 30,
): number {
  const pixels = width * height;
  if (!pixels || !seconds) return 0;

  return (
    LOOP_COEFFICIENT *
    pixels ** LOOP_EXPONENT *
    seconds *
    (fps > 30 ? LOOP_60_FPS_FACTOR : 1)
  );
}

import type { Corners } from "@/lib/style-options";

export interface StyleOptions {
  gradientId: string;
  gradientAngle: number;
  padding: number;
  /** Corner radius in px. */
  outerRadius: number;
  imageRadius: number;
  /** Which of the screenshot's corners the image radius applies to. */
  imageCorners: Corners;
  shadow: string;
  showWindowNavbar: boolean;
  windowNavbarDark: boolean;
  showNoiseOverlay: boolean;
  /** Grain strength, 0 to 100. */
  noiseIntensity: number;
  useCustomGradient: boolean;
  customGradientFrom: string;
  customGradientTo: string;
}

export interface ExportOptions {
  quality: number;
  filename?: string;
}

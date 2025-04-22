export interface StyleOptions {
  gradientStyle: string;
  padding: number;
  outerRadius: string;
  imageRadius: string;
  shadow: string;
  showWindowNavbar: boolean;
  windowNavbarDark: boolean;
  showNoiseOverlay: boolean;
  useCustomGradient: boolean;
  customGradientFrom: string;
  customGradientTo: string;
}

export interface ExportOptions {
  quality: number;
  filename?: string;
}
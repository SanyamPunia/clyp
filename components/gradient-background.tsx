import type React from "react";
import { cn } from "@/lib/utils";

interface GradientBackgroundProps {
  gradientStyle: string;
  useCustomGradient?: boolean;
  customGradientFrom?: string;
  customGradientTo?: string;
  showNoiseOverlay?: boolean;
  children: React.ReactNode;
}

export function GradientBackground({
  gradientStyle,
  useCustomGradient = false,
  customGradientFrom = "#3b82f6",
  customGradientTo = "#8b5cf6",
  showNoiseOverlay = false,
  children,
}: GradientBackgroundProps) {
  return (
    <div
      className={cn(
        "relative transition-all duration-300 ease-in-out",
        useCustomGradient ? "" : getGradientClass(gradientStyle)
      )}
      style={
        useCustomGradient
          ? {
              background: `linear-gradient(to bottom right, ${customGradientFrom}, ${customGradientTo})`,
            }
          : {}
      }
    >
      {showNoiseOverlay && (
        <div
          className="absolute inset-0 opacity-20 mix-blend-overlay"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.2' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
            backgroundRepeat: "repeat",
            width: "100%",
            height: "100%",
          }}
        />
      )}
      <div className="relative">{children}</div>
    </div>
  );
}

function getGradientClass(style: string): string {
  switch (style) {
    case "blue-purple":
      return "bg-gradient-to-br from-blue-500 to-purple-600";
    case "green-blue":
      return "bg-gradient-to-br from-green-400 to-blue-500";
    case "orange-red":
      return "bg-gradient-to-br from-orange-400 to-red-500";
    case "pink-purple":
      return "bg-gradient-to-br from-pink-400 to-purple-600";
    case "gray-slate":
      return "bg-gradient-to-br from-gray-200 to-slate-400";
    case "yellow-orange":
      return "bg-gradient-to-br from-yellow-300 to-orange-500";
    case "teal-blue":
      return "bg-gradient-to-br from-teal-400 to-blue-500";
    case "indigo-purple":
      return "bg-gradient-to-br from-indigo-500 to-purple-600";
    case "red-pink":
      return "bg-gradient-to-br from-red-500 to-pink-500";
    default:
      return "bg-gradient-to-br from-blue-500 to-purple-600";
  }
}

"use client";

import { toPng } from "html-to-image";
import { Camera, Copy, Download, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { ExportModal } from "@/components/export-modal";
import { GradientBackground } from "@/components/gradient-background";
import { ImageUploader } from "@/components/image-uploader";
import { StyleControls } from "@/components/style-controls";
import { Button } from "@/components/ui/button";
import { WindowNavbar } from "@/components/window-navbar";
import { cn } from "@/lib/utils";
import type { ExportOptions, StyleOptions } from "@/types/screenshot";
import { toast } from "sonner";

export function Clyp() {
  const [image, setImage] = useState<string | null>(null);
  const [styleOptions, setStyleOptions] = useState<StyleOptions>({
    gradientStyle: "blue-purple",
    padding: 40,
    outerRadius: "rounded-md",
    imageRadius: "rounded-md",
    shadow: "shadow-none",
    showWindowNavbar: false,
    windowNavbarDark: false,
    showNoiseOverlay: false,
    useCustomGradient: false,
    customGradientFrom: "#3b82f6",
    customGradientTo: "#8b5cf6",
  });
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportAction, setExportAction] = useState<"copy" | "download">(
    "download"
  );

  const screenshotRef = useRef<HTMLDivElement>(null);

  // handle paste event for the entire document
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") !== -1) {
          const blob = items[i].getAsFile();
          if (blob) {
            const reader = new FileReader();
            reader.onload = (e) => {
              setImage(e.target?.result as string);
            };
            reader.readAsDataURL(blob);
          }
        }
      }
    };

    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, []);

  const handleImageUpload = useCallback((imageData: string) => {
    setImage(imageData);
  }, []);

  const handleExport = useCallback(
    async (options: ExportOptions) => {
      if (!screenshotRef.current) return;

      try {
        const dataUrl = await toPng(screenshotRef.current, {
          cacheBust: true,

          // 1 -> initial scale (1x)
          pixelRatio: options.quality,
        });

        if (exportAction === "copy") {
          const blob = await fetch(dataUrl).then((res) => res.blob());
          await navigator.clipboard.write([
            new ClipboardItem({ [blob.type]: blob }),
          ]);
          toast.success("Image copied to clipboard!");
        } else {
          const link = document.createElement("a");
          link.download = options.filename || "beautified-screenshot.png";
          link.href = dataUrl;
          link.click();
        }

        setExportModalOpen(false);
      } catch (err) {
        console.error("Failed to export image:", err);
      }
    },
    [exportAction]
  );

  const openExportModal = useCallback((action: "copy" | "download") => {
    setExportAction(action);
    setExportModalOpen(true);
  }, []);

  const handleStyleChange = useCallback((newOptions: Partial<StyleOptions>) => {
    setStyleOptions((prev) => ({ ...prev, ...newOptions }));
  }, []);

  return (
    <div className="container py-8">
      <div className="max-w-6xl mx-auto">
        <div className="grid gap-8 md:grid-cols-[1fr_300px]">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium">Preview</h2>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs rounded-sm shadow-none cursor-pointer flex items-center"
                  onClick={() => openExportModal("copy")}
                  disabled={!image}
                >
                  <Copy className="size-3" />
                  Copy
                </Button>
                <Button
                  size="sm"
                  className="text-xs rounded-sm shadow-none cursor-pointer flex items-center"
                  onClick={() => openExportModal("download")}
                  disabled={!image}
                >
                  <Download className="size-3" />
                  Download
                </Button>
              </div>
            </div>

            <div
              className={`bg-slate-100 rounded-sm ${!image ? "md:p-20 px-6 py-10" : "p-0"
                } flex items-center justify-center relative`}
            >
              <Button
                variant="secondary"
                size="sm"
                className="text-xs rounded-md shadow-none cursor-pointer absolute top-2 right-2 z-10 active:scale-90 transition-transform"
                onClick={() => setImage(null)}
                disabled={!image}
              >
                <Trash2 className="size-3" />
              </Button>

              {image ? (
                <div
                  ref={screenshotRef}
                  className={cn(
                    styleOptions.outerRadius,
                    "overflow-hidden",
                    "inline-block",
                    "transition-all duration-300 ease-in-out"
                  )}
                >
                  <GradientBackground
                    gradientStyle={styleOptions.gradientStyle}
                    useCustomGradient={styleOptions.useCustomGradient}
                    customGradientFrom={styleOptions.customGradientFrom}
                    customGradientTo={styleOptions.customGradientTo}
                    showNoiseOverlay={styleOptions.showNoiseOverlay}
                  >
                    <div style={{ padding: `${styleOptions.padding}px` }} className="flex items-center justify-center">
                      <div className="relative inline-block">
                        {styleOptions.showWindowNavbar && (
                          <WindowNavbar
                            dark={styleOptions.windowNavbarDark}
                            className={styleOptions.imageRadius === "rounded-none" ? "rounded-none" : "rounded-t-md"}
                          />
                        )}
                        <img
                          src={image}
                          alt="Screenshot"
                          className={cn(
                            styleOptions.showWindowNavbar
                              ? {
                                'rounded-none': styleOptions.imageRadius === 'rounded-none',
                                'rounded-b-sm': styleOptions.imageRadius === 'rounded-sm',
                                'rounded-b-md': styleOptions.imageRadius === 'rounded-md',
                                'rounded-b-lg': styleOptions.imageRadius === 'rounded-lg',
                                'rounded-b-xl': styleOptions.imageRadius === 'rounded-xl',
                                'rounded-b-2xl': styleOptions.imageRadius === 'rounded-2xl',
                                'rounded-b-3xl': styleOptions.imageRadius === 'rounded-3xl',
                              }
                              : styleOptions.imageRadius,
                            styleOptions.shadow,
                            "max-w-full h-auto transition-all duration-300 ease-in-out",
                            "block select-none",
                          )}
                          draggable={false}
                        />
                      </div>
                    </div>
                  </GradientBackground>
                </div>
              ) : (
                <div className="w-full max-w-md flex flex-col justify-center p-8 rounded-sm bg-white border border-border">
                  <Camera className="size-10 text-muted-foreground mb-4" />
                  <div>
                    <h3 className="text-sm font-medium mb-2">
                      No screenshot yet
                    </h3>
                    <p className="text-xs text-muted-foreground mb-4">
                      Upload a screenshot or paste from clipboard{" "}
                      <span className="font-medium">(Ctrl+V / Cmd+V)</span>
                    </p>
                  </div>
                  <ImageUploader onImageUpload={handleImageUpload} />
                </div>
              )}
            </div>
          </div>

          <div>
            <h2 className="text-sm font-medium mb-4">Customize</h2>
            <StyleControls
              options={styleOptions}
              onChange={handleStyleChange}
              disabled={!image}
            />
          </div>
        </div>
      </div>

      <ExportModal
        open={exportModalOpen}
        onOpenChange={setExportModalOpen}
        onExport={handleExport}
        action={exportAction}
      />
    </div>
  );
}

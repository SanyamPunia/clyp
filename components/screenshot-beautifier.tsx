"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Copy, Download } from "lucide-react";
import { toPng } from "html-to-image";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ImageUploader } from "@/components/image-uploader";
import { StyleControls } from "@/components/style-controls";
import { GradientBackground } from "@/components/gradient-background";
import { WindowNavbar } from "@/components/window-navbar";
import { ExportModal } from "@/components/export-modal";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { StyleOptions, ExportOptions } from "@/types/screenshot";

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

  const handleStyleChange = useCallback((newOptions: Partial<StyleOptions>) => {
    setStyleOptions((prev) => ({ ...prev, ...newOptions }));
  }, []);

  const handleExport = useCallback(
    async (options: ExportOptions) => {
      if (!screenshotRef.current) return;

      try {
        const dataUrl = await toPng(screenshotRef.current, {
          cacheBust: true,
          pixelRatio: options.quality,
        });

        if (exportAction === "copy") {
          const blob = await fetch(dataUrl).then((res) => res.blob());
          await navigator.clipboard.write([
            new ClipboardItem({ [blob.type]: blob }),
          ]);
          alert("Image copied to clipboard!");
        } else {
          const link = document.createElement("a");
          link.download = options.filename || "clyp-screenshot.png";
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

  return (
    <div className="flex flex-col p-4 md:p-6">
      <div className="flex-1 grid gap-4 md:grid-cols-[1fr_300px] overflow-hidden">
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-medium">Preview</h2>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => openExportModal("copy")}
                disabled={!image}
              >
                <Copy className="h-3 w-3 mr-1" />
                Copy
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => openExportModal("download")}
                disabled={!image}
              >
                <Download className="h-3 w-3 mr-1" />
                Download
              </Button>
            </div>
          </div>

          <div className="flex items-center">
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
                  <div className="relative">
                    {styleOptions.showWindowNavbar && (
                      <WindowNavbar dark={styleOptions.windowNavbarDark} />
                    )}
                    <div
                      style={{ padding: `${styleOptions.padding}px` }}
                      className="flex items-center justify-center"
                    >
                      <img
                        src={image}
                        alt="Screenshot"
                        className={cn(
                          styleOptions.imageRadius,
                          styleOptions.shadow,
                          "max-w-full h-auto transition-all duration-300 ease-in-out"
                        )}
                      />
                    </div>
                  </div>
                </GradientBackground>
              </div>
            ) : (
              <Card className="flex flex-col items-center justify-center p-8 m-4">
                <Camera className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-sm font-medium mb-2">No screenshot yet</h3>
                <p className="text-xs text-muted-foreground text-center mb-4">
                  Upload a screenshot or paste from clipboard (Ctrl+V / Cmd+V)
                </p>
                <ImageUploader onImageUpload={handleImageUpload} />
              </Card>
            )}
          </div>
        </div>

        <div className="h-full flex flex-col">
          <h2 className="text-sm font-medium mb-2">Customize</h2>
          <ScrollArea className="flex-1 pr-2">
            <StyleControls
              options={styleOptions}
              onChange={handleStyleChange}
              onReset={() => setImage(null)}
              disabled={!image}
            />
          </ScrollArea>
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

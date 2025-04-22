"use client";

import { Trash } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  gradientOptions,
  radiusOptions,
  shadowOptions,
} from "@/lib/style-options";
import type { StyleOptions } from "@/types/screenshot";
import { ColorPicker } from "@/components/color-picker";

interface StyleControlsProps {
  options: StyleOptions;
  onChange: (options: Partial<StyleOptions>) => void;
  disabled?: boolean;
}

export function StyleControls({
  options,
  onChange,
  disabled = false,
}: StyleControlsProps) {
  return (
    <div className="space-y-4">
      <div
        className={`max-h-[calc(100vh-10rem)] pr-4 ${disabled ? "opacity-50 pointer-events-none" : "md:overflow-y-auto"}`}
      >
        <Accordion
          type="multiple"
          defaultValue={["background"]}
        >
          <AccordionItem value="background">
            <AccordionTrigger className="text-xs pb-3 cursor-pointer">
              Background
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4">
                <Tabs defaultValue="presets" className="w-full">
                  <TabsList className="grid grid-cols-2 mb-2 rounded-sm w-full">
                    <TabsTrigger value="presets" className="text-xs rounded-sm">
                      Presets
                    </TabsTrigger>
                    <TabsTrigger value="custom" className="text-xs rounded-sm">
                      Custom
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="presets">
                    <div className="grid grid-cols-3 gap-2">
                      {gradientOptions.map((gradient) => (
                        <button
                          key={gradient.value}
                          className={`h-9 rounded-sm cursor-pointer overflow-hidden border-2 transition-all duration-300 ease-in-out ${
                            options.gradientStyle === gradient.value
                              ? "border-zinc-300 shadow-xl"
                              : "border-transparent"
                          }`}
                          onClick={() =>
                            onChange({
                              gradientStyle: gradient.value,
                              useCustomGradient: false,
                            })
                          }
                        >
                          <div
                            className={`w-full h-full ${gradient.previewClass}`}
                          />
                        </button>
                      ))}
                    </div>
                  </TabsContent>
                  <TabsContent value="custom">
                    <div className="space-y-3">
                      <div>
                        <Label className="text-xs mb-1 block">
                          Start Color
                        </Label>
                        <ColorPicker
                          color={options.customGradientFrom}
                          onChange={(color) =>
                            onChange({
                              customGradientFrom: color,
                              useCustomGradient: true,
                            })
                          }
                        />
                      </div>
                      <div>
                        <Label className="text-xs mb-1 block">End Color</Label>
                        <ColorPicker
                          color={options.customGradientTo}
                          onChange={(color) =>
                            onChange({
                              customGradientTo: color,
                              useCustomGradient: true,
                            })
                          }
                        />
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>

                <div className="flex items-center justify-between">
                  <Label
                    htmlFor="noise-overlay"
                    className="text-xs cursor-pointer"
                  >
                    Noise Overlay
                  </Label>
                  <Switch
                    id="noise-overlay"
                    checked={options.showNoiseOverlay}
                    onCheckedChange={(checked) =>
                      onChange({ showNoiseOverlay: checked })
                    }
                  />
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="appearance">
            <AccordionTrigger className="text-xs pb-3 cursor-pointer">
              Appearance
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4">
                <div>
                  <Label className="text-xs mb-2 block">Padding</Label>
                  <div className="flex items-center gap-4">
                    <Slider
                      value={[options.padding]}
                      min={0}
                      max={100}
                      step={4}
                      onValueChange={(value) => onChange({ padding: value[0] })}
                      className="flex-1"
                    />
                    <span className="text-xs w-8 text-right">
                      {options.padding}px
                    </span>
                  </div>
                </div>

                <div>
                  <Label className="text-xs mb-2 block">
                    Outer Border Radius
                  </Label>
                  <RadioGroup
                    value={options.outerRadius}
                    onValueChange={(value) => onChange({ outerRadius: value })}
                    className="grid grid-cols-3 gap-2"
                  >
                    {radiusOptions.map((radius) => (
                      <Label
                        key={radius.value}
                        htmlFor={`outer-${radius.value}`}
                        className={`flex items-center justify-center border rounded-md p-2 cursor-pointer text-xs transition-all duration-300 ease-in-out ${
                          options.outerRadius === radius.value
                            ? "bg-muted border-zinc-300"
                            : ""
                        }`}
                      >
                        <RadioGroupItem
                          value={radius.value}
                          id={`outer-${radius.value}`}
                          className="sr-only"
                        />
                        {radius.label}
                      </Label>
                    ))}
                  </RadioGroup>
                </div>

                <div>
                  <Label className="text-xs mb-2 block">
                    Image Border Radius
                  </Label>
                  <RadioGroup
                    value={options.imageRadius}
                    onValueChange={(value) => onChange({ imageRadius: value })}
                    className="grid grid-cols-3 gap-2"
                  >
                    {radiusOptions.map((radius) => (
                      <Label
                        key={radius.value}
                        htmlFor={`image-${radius.value}`}
                        className={`flex items-center justify-center border rounded-md p-2 cursor-pointer text-xs transition-all duration-300 ease-in-out ${
                          options.imageRadius === radius.value
                            ? "bg-muted border-zinc-300"
                            : ""
                        }`}
                      >
                        <RadioGroupItem
                          value={radius.value}
                          id={`image-${radius.value}`}
                          className="sr-only"
                        />
                        {radius.label}
                      </Label>
                    ))}
                  </RadioGroup>
                </div>

                <div>
                  <Label className="text-xs mb-2 block">Shadow</Label>
                  <RadioGroup
                    value={options.shadow}
                    onValueChange={(value) => onChange({ shadow: value })}
                    className="grid grid-cols-3 gap-2"
                  >
                    {shadowOptions.map((shadow) => (
                      <Label
                        key={shadow.value}
                        htmlFor={`shadow-${shadow.value}`}
                        className={`flex items-center justify-center border rounded-md p-2 cursor-pointer text-xs transition-all duration-300 ease-in-out ${
                          options.shadow === shadow.value
                            ? "bg-muted border-zinc-300"
                            : ""
                        }`}
                      >
                        <RadioGroupItem
                          value={shadow.value}
                          id={`shadow-${shadow.value}`}
                          className="sr-only"
                        />
                        {shadow.label}
                      </Label>
                    ))}
                  </RadioGroup>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="window">
            <AccordionTrigger className="text-xs pb-3 cursor-pointer">
              Window Style
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label
                    htmlFor="window-navbar"
                    className="text-xs cursor-pointer"
                  >
                    Window Navbar
                  </Label>
                  <Switch
                    id="window-navbar"
                    checked={options.showWindowNavbar}
                    onCheckedChange={(checked) =>
                      onChange({ showWindowNavbar: checked })
                    }
                  />
                </div>

                {options.showWindowNavbar && (
                  <div className="pl-4 border-l-2 border-muted">
                    <div className="flex items-center justify-between">
                      <Label
                        htmlFor="window-navbar-theme"
                        className="text-xs cursor-pointer"
                      >
                        Dark Theme
                      </Label>
                      <Switch
                        id="window-navbar-theme"
                        checked={options.windowNavbarDark}
                        onCheckedChange={(checked) =>
                          onChange({ windowNavbarDark: checked })
                        }
                      />
                    </div>
                  </div>
                )}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  );
}

"use client";

import { CheckIcon } from "lucide-react";

import { ColorPicker } from "@/components/color-picker";
import { FieldLabel } from "@/components/ui/field-label";
import { Input } from "@/components/ui/input";
import { SegmentedGroup, SegmentedOption } from "@/components/ui/segmented";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  angleApplies,
  backgroundKinds,
  customGradientToCss,
  gradientFamilies,
  gradientPresets,
  gradientToCss,
  getGradient,
  solidToCss,
  supportsAngle,
} from "@/lib/gradients";
import {
  aspectOptions,
  CAPTION_SIZE,
  captionPositionOptions,
  CORNER_ORDER,
  cornerPresets,
  cornerRadius,
  radiusSizes,
  shadowOptions,
  windowChromeOptions,
  type Corner,
  type Corners,
} from "@/lib/style-options";
import { cn } from "@/lib/utils";
import type { StyleOptions } from "@/types/screenshot";

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
  const activePreset = getGradient(options.gradientId);
  const hasAngle = angleApplies(options);
  const captioned = options.caption.trim().length > 0;
  // Grain over nothing is nothing: an overlay blend at any strength leaves a
  // transparent background transparent, so the control would be dead.
  const grainApplies = options.background !== "none";
  const backgroundMeta =
    options.background === "preset"
      ? activePreset.label
      : backgroundKinds.find((kind) => kind.value === options.background)!.label;

  return (
    <div
      aria-disabled={disabled || undefined}
      className={cn(
        "divide-y divide-stroke transition-opacity duration-200",
        disabled && "pointer-events-none opacity-45 select-none"
      )}
    >
      <Section title="Background" meta={backgroundMeta}>
        <Tabs
          value={options.background}
          onValueChange={(value) =>
            onChange({ background: value as StyleOptions["background"] })
          }
        >
          <TabsList className="mb-3 grid w-full grid-cols-4">
            {backgroundKinds.map((kind) => (
              <TabsTrigger key={kind.value} value={kind.value} className="text-xs">
                {kind.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="preset" className="flex flex-col gap-4">
            {gradientFamilies.map((family) => {
              const presets = gradientPresets.filter(
                (preset) => preset.family === family.id
              );
              // Whether the chosen background is one of this family's, which
              // decides where the family's single tab stop sits.
              const chosen =
                options.background === "preset" &&
                presets.some((preset) => preset.id === options.gradientId);

              return (
                <div key={family.id} className="flex flex-col gap-2">
                  <p className="text-[13px] text-muted-foreground">{family.label}</p>
                  <RovingGrid
                    label={`${family.label} backgrounds`}
                    className="grid grid-cols-4 gap-2 sm:grid-cols-8"
                  >
                    {presets.map((preset, index) => {
                      const selected =
                        options.background === "preset" &&
                        options.gradientId === preset.id;
                      // One tab stop per family: the chosen swatch, or the
                      // first when the choice is elsewhere. Sixty-four stops
                      // between the picker and the angle slider is a long walk
                      // for a reader who is not looking for a background.
                      const stop = selected || (!chosen && index === 0);

                      return (
                        <button
                          key={preset.id}
                          type="button"
                          title={preset.label}
                          aria-pressed={selected}
                          onClick={() =>
                            onChange({
                              gradientId: preset.id,
                              background: "preset",
                            })
                          }
                          tabIndex={stop ? 0 : -1}
                          className={cn(
                            "group relative aspect-[4/5] cursor-pointer overflow-hidden rounded-md",
                            "outline-2 outline-offset-2 transition-all duration-150 active:scale-[0.94]",
                            selected
                              ? "outline-brand"
                              : "outline-transparent hover:outline-stroke-strong"
                          )}
                        >
                          <span
                            className="absolute inset-0"
                            style={{
                              backgroundImage: gradientToCss(
                                preset,
                                supportsAngle(preset)
                                  ? options.gradientAngle
                                  : undefined
                              ),
                            }}
                          />
                          {selected && (
                            <span className="absolute inset-0 flex items-center justify-center">
                              <span className="rounded-full bg-black/35 p-0.5 backdrop-blur-sm">
                                <CheckIcon
                                  className="size-3"
                                  style={{ color: "#fff" }}
                                  aria-hidden="true"
                                />
                              </span>
                            </span>
                          )}
                          <span className="sr-only">{preset.label}</span>
                        </button>
                      );
                    })}
                  </RovingGrid>
                </div>
              );
            })}
          </TabsContent>

          <TabsContent value="custom" className="grid gap-3 sm:grid-cols-2">
            <div
              className="h-24 w-full rounded-md border border-stroke sm:col-span-2"
              style={{
                backgroundImage: customGradientToCss(
                  options.customGradientFrom,
                  options.customGradientTo,
                  options.gradientAngle
                ),
              }}
              aria-hidden="true"
            />
            <div className="flex flex-col gap-1.5">
              <FieldLabel>Start</FieldLabel>
              <ColorPicker
                color={options.customGradientFrom}
                onChange={(color) =>
                  onChange({
                    customGradientFrom: color,
                    background: "custom",
                  })
                }
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <FieldLabel>End</FieldLabel>
              <ColorPicker
                color={options.customGradientTo}
                onChange={(color) =>
                  onChange({ customGradientTo: color, background: "custom" })
                }
              />
            </div>
          </TabsContent>

          <TabsContent value="solid" className="flex flex-col gap-3">
            <div
              className="h-24 w-full rounded-md border border-stroke"
              style={{ backgroundImage: solidToCss(options.solidColor) }}
              aria-hidden="true"
            />
            <div className="flex flex-col gap-1.5">
              <FieldLabel>Colour</FieldLabel>
              <ColorPicker
                color={options.solidColor}
                onChange={(color) =>
                  onChange({ solidColor: color, background: "solid" })
                }
              />
            </div>
          </TabsContent>

          <TabsContent value="none">
            <div className="transparency-grid h-24 w-full rounded-md border border-stroke" aria-hidden="true" />
            <p className="mt-3 text-xs text-muted-foreground">
              The PNG keeps its transparency. MP4 has none, so a clip exports
              on black.
            </p>
          </TabsContent>
        </Tabs>

        <div className="flex flex-col gap-4 border-t border-stroke pt-4">
          {hasAngle ? (
            <SliderRow
              label="Angle"
              value={options.gradientAngle}
              min={0}
              max={360}
              step={15}
              suffix="deg"
              onChange={(value) => onChange({ gradientAngle: value })}
            />
          ) : (
            <p className="text-xs text-muted-foreground">
              {options.background === "solid"
                ? "A flat colour does not use an angle."
                : options.background === "none"
                  ? "There is nothing behind the artwork to angle."
                  : "Mesh gradients do not use an angle."}
            </p>
          )}

          <ToggleRow
            id="noise-overlay"
            label="Grain"
            checked={options.showNoiseOverlay}
            disabled={!grainApplies}
            onCheckedChange={(checked) =>
              onChange({ showNoiseOverlay: checked })
            }
          />

          <SliderRow
            label="Grain amount"
            value={options.noiseIntensity}
            min={5}
            max={100}
            step={5}
            suffix="%"
            disabled={!grainApplies || !options.showNoiseOverlay}
            onChange={(value) => onChange({ noiseIntensity: value })}
          />
        </div>
      </Section>

      <Section title="Frame">
        <ChoiceRow
          label="Shape"
          name="aspect"
          value={options.aspect}
          options={aspectOptions}
          columns={5}
          onChange={(aspect) => onChange({ aspect })}
        />
        <SliderRow
          label="Padding"
          value={options.padding}
          min={0}
          max={160}
          step={4}
          suffix="px"
          onChange={(value) => onChange({ padding: value })}
        />

        <SizeRow
          label="Outer radius"
          name="outer"
          value={options.outerRadius}
          onChange={(value) => onChange({ outerRadius: value })}
        />

        <SizeRow
          label="Image radius"
          name="image"
          value={options.imageRadius}
          onChange={(value) => onChange({ imageRadius: value })}
        />

        <CornerRow
          radius={options.imageRadius}
          corners={options.imageCorners}
          onChange={(imageCorners) => onChange({ imageCorners })}
        />
      </Section>

      <Section title="Window">
        <ChoiceRow
          label="Style"
          name="window"
          value={options.windowChrome}
          options={windowChromeOptions}
          onChange={(windowChrome) => onChange({ windowChrome })}
        />

        <ToggleRow
          id="window-navbar-theme"
          label="Dark title bar"
          checked={options.windowNavbarDark}
          disabled={options.windowChrome === "none"}
          onCheckedChange={(checked) => onChange({ windowNavbarDark: checked })}
        />

        <TextRow
          id="window-url"
          label="Address"
          value={options.windowUrl}
          placeholder="example.com"
          disabled={options.windowChrome !== "browser"}
          onChange={(windowUrl) => onChange({ windowUrl })}
        />
      </Section>

      {/* The rows under the text follow it: with nothing to place there is
          nothing for them to do, the same way the grain amount follows the
          grain switch. */}
      <Section title="Caption">
        <TextRow
          id="caption"
          label="Text"
          value={options.caption}
          placeholder="Add a caption"
          onChange={(caption) => onChange({ caption })}
        />

        <ChoiceRow
          label="Position"
          name="caption-position"
          value={options.captionPosition}
          options={captionPositionOptions}
          columns={2}
          disabled={!captioned}
          onChange={(captionPosition) => onChange({ captionPosition })}
        />

        <SliderRow
          label="Size"
          value={options.captionSize}
          min={CAPTION_SIZE.min}
          max={CAPTION_SIZE.max}
          step={CAPTION_SIZE.step}
          suffix="px"
          disabled={!captioned}
          onChange={(value) => onChange({ captionSize: value })}
        />

        <ToggleRow
          id="caption-dark"
          label="Dark text"
          checked={options.captionDark}
          disabled={!captioned}
          onCheckedChange={(checked) => onChange({ captionDark: checked })}
        />
      </Section>

      <Section title="Depth">
        <ChoiceRow
          label="Shadow"
          name="shadow"
          value={options.shadow}
          options={shadowOptions}
          onChange={(value) => onChange({ shadow: value })}
        />
      </Section>
    </div>
  );
}

function Section({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 px-5 py-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium tracking-tight text-foreground">
          {title}
        </h3>
        {meta && (
          <span className="text-[13px] text-muted-foreground">{meta}</span>
        )}
      </div>
      {children}
    </section>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  suffix,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 transition-opacity duration-150",
        disabled && "opacity-50"
      )}
    >
      <div className="flex items-center justify-between">
        <FieldLabel>{label}</FieldLabel>
        <span className="text-[13px] tabular-nums text-foreground">
          {value}
          {suffix}
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onValueChange={(next) => onChange(next[0])}
      />
    </div>
  );
}

function SizeRow({
  label,
  name,
  value,
  onChange,
}: {
  label: string;
  name: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <FieldLabel>{label}</FieldLabel>
      <SegmentedGroup
        value={String(value)}
        onValueChange={(next) => onChange(Number(next))}
        className="grid-cols-3"
      >
        {radiusSizes.map((size) => (
          <SegmentedOption
            key={size.value}
            id={`${name}-${size.value}`}
            value={String(size.value)}
            selected={value === size.value}
            className="h-8"
          >
            {size.label}
          </SegmentedOption>
        ))}
      </SegmentedGroup>
    </div>
  );
}

/**
 * Corner picker. Each toggle previews the corner it controls by rounding that
 * one corner of a small square, so no icon or glyph is needed to name it.
 */
function CornerRow({
  radius,
  corners,
  onChange,
}: {
  radius: number;
  corners: Corners;
  onChange: (corners: Corners) => void;
}) {
  const disabled = radius === 0;
  const toggle = (key: Corner) =>
    onChange({ ...corners, [key]: !corners[key] });

  return (
    <div
      className={cn(
        "flex flex-col gap-2 transition-opacity duration-150",
        disabled && "opacity-50"
      )}
    >
      <div className="flex items-center justify-between">
        <FieldLabel>Rounded corners</FieldLabel>
        <span className="text-[13px] tabular-nums text-foreground">
          {CORNER_ORDER.filter((corner) => corners[corner.key]).length} of 4
        </span>
      </div>

      <div className="flex items-center gap-3">
        <div className="grid shrink-0 grid-cols-2 gap-1 rounded-lg bg-track p-1">
          {CORNER_ORDER.map((corner) => (
            <button
              key={corner.key}
              type="button"
              aria-label={corner.label}
              aria-pressed={corners[corner.key]}
              disabled={disabled}
              onClick={() => toggle(corner.key)}
              className={cn(
                "grid size-7 cursor-pointer place-items-center rounded-md",
                "transition-all duration-150 active:scale-[0.94]",
                "disabled:cursor-not-allowed",
                corners[corner.key]
                  ? "bg-track-active shadow-sm"
                  : "hover:bg-panel/60"
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "block size-3.5 border-t-2 border-l-2",
                  corners[corner.key]
                    ? "border-foreground"
                    : "border-muted-foreground",
                  corner.key === "tr" && "rotate-90",
                  corner.key === "br" && "rotate-180",
                  corner.key === "bl" && "-rotate-90"
                )}
                style={{
                  borderTopLeftRadius: corners[corner.key] ? "6px" : "0px",
                }}
              />
            </button>
          ))}
        </div>

        <div className="grid flex-1 grid-cols-2 gap-1 rounded-lg bg-track p-1">
          {cornerPresets.map((preset) => (
            <button
              key={preset.label}
              type="button"
              disabled={disabled}
              onClick={() => onChange(preset.corners)}
              className={cn(
                "h-7 cursor-pointer rounded-md text-[13px]",
                "transition-all duration-150 active:scale-[0.97]",
                "disabled:cursor-not-allowed",
                isSameCorners(preset.corners, corners)
                  ? "bg-track-active text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <div
        aria-hidden="true"
        className="h-10 w-full border border-stroke bg-elevated"
        style={{ borderRadius: cornerRadius(radius, corners) }}
      />
    </div>
  );
}

function isSameCorners(a: Corners, b: Corners): boolean {
  return CORNER_ORDER.every((corner) => a[corner.key] === b[corner.key]);
}

/** Spelled out rather than built, so Tailwind sees every class it has to ship. */
const COLUMNS: Record<number, string> = {
  2: "grid-cols-2",
  3: "grid-cols-3",
  5: "grid-cols-5",
};

/**
 * Generic over the option value, so a field typed as a union stays one through
 * the control instead of widening to `string` on the way back.
 */
function ChoiceRow<T extends string>({
  label,
  name,
  value,
  options,
  columns = 3,
  disabled,
  onChange,
}: {
  label: string;
  name: string;
  value: T;
  options: readonly { value: T; label: string }[];
  /** How many across. Five short labels read better on one line than 3 and 2. */
  columns?: 2 | 3 | 5;
  disabled?: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 transition-opacity duration-150",
        disabled && "opacity-50"
      )}
    >
      <FieldLabel>{label}</FieldLabel>
      <SegmentedGroup
        value={value}
        onValueChange={(next) => onChange(next as T)}
        className={COLUMNS[columns]}
      >
        {options.map((option) => (
          <SegmentedOption
            key={option.value}
            id={`${name}-${option.value}`}
            value={option.value}
            selected={value === option.value}
            disabled={disabled}
            className="h-8"
          >
            {option.label}
          </SegmentedOption>
        ))}
      </SegmentedGroup>
    </div>
  );
}

function TextRow({
  id,
  label,
  value,
  placeholder,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 transition-opacity duration-150",
        disabled && "opacity-50"
      )}
    >
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
        className="text-xs placeholder:text-xs"
      />
    </div>
  );
}

function ToggleRow({
  id,
  label,
  checked,
  disabled,
  onCheckedChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between transition-opacity duration-150",
        disabled && "opacity-50"
      )}
    >
      <FieldLabel htmlFor={id} className="cursor-pointer">
        {label}
      </FieldLabel>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}

/**
 * A grid whose items share one tab stop and are walked with the arrow keys.
 *
 * The background picker is sixty-four swatches. As sixty-four tab stops it is
 * a wall between the panel's first control and its second, and a reader not
 * looking for a background has to walk all of it. One stop per family and the
 * arrows inside is what a set of related choices is supposed to do.
 *
 * Navigation is linear rather than by row and column. The grid is four columns
 * at one width and eight at another, so a Down that means "one row" would have
 * to measure the layout to know what a row is, and would be wrong whenever it
 * guessed. Next and previous are right at any column count.
 */
function RovingGrid({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  const move = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const keys = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"];
    if (!keys.includes(event.key)) return;

    const items = [
      ...event.currentTarget.querySelectorAll<HTMLButtonElement>("button"),
    ].filter((item) => !item.disabled);
    const from = items.indexOf(document.activeElement as HTMLButtonElement);
    if (from < 0) return;

    event.preventDefault();
    const to =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? items.length - 1
          : event.key === "ArrowRight" || event.key === "ArrowDown"
            ? Math.min(from + 1, items.length - 1)
            : Math.max(from - 1, 0);
    items[to]?.focus();
  };

  return (
    <div role="group" aria-label={label} className={className} onKeyDown={move}>
      {children}
    </div>
  );
}

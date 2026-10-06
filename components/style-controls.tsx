"use client";

import {
  CheckIcon,
  ChevronDownIcon,
  Loader2Icon,
  PipetteIcon,
  PlusIcon,
  RotateCcwIcon,
  XIcon,
} from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dimensions } from "@/components/ui/dimensions";
import { ColorPicker } from "@/components/color-picker";
import { FieldLabel } from "@/components/ui/field-label";
import { Input } from "@/components/ui/input";
import { PlatformIcon } from "@/components/platform-icon";
import { ShaderSwatch } from "@/components/shader-swatch";
import { useShaderSupport } from "@/components/use-shader-support";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SegmentedGroup, SegmentedOption } from "@/components/ui/segmented";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  angleApplies,
  backgroundKinds,
  customGradientToCss,
  gradientFamilies,
  gradientPresets,
  gradientToCss,
  getGradient,
  resolveGradientCss,
  shaderFieldOf,
  solidToCss,
  supportsAngle,
  type GradientFamily,
  type GradientPreset,
} from "@/lib/gradients";
import { BACKGROUND_SPEEDS } from "@/lib/shader";
import { type Look, isLook } from "@/lib/looks";
import {
  MAX_SLIDES,
  NO_TEMPLATE,
  getTemplate,
  platforms,
  slideCount,
  templates,
} from "@/lib/templates";
import {
  aspectOptions,
  BADGE_SIZE,
  badgePositionOptions,
  CAPTION_SIZE,
  captionPositionOptions,
  CORNER_ORDER,
  cornerPresets,
  cornerRadius,
  deviceOptions,
  radiusSizes,
  shadowOptions,
  windowChromeOptions,
  type Corner,
  type Corners,
} from "@/lib/style-options";
import { cn } from "@/lib/utils";
import type { MediaKind, StyleOptions } from "@/types/screenshot";

interface StyleControlsProps {
  options: StyleOptions;
  onChange: (options: Partial<StyleOptions>) => void;
  /** Puts every control back to its default. Confirmed by the owner. */
  onReset: () => void;
  /** False while the style already is the default, which disables the reset. */
  canReset: boolean;
  disabled?: boolean;
  /** What is loaded, which decides whether the clip's own controls show. */
  kind?: MediaKind;
  /** Sets the custom gradient from the picture's own colours. */
  onMatchPicture: () => void;
  /** Whether the safe zone and slide guides are drawn over the canvas. */
  showGuides: boolean;
  onShowGuidesChange: (show: boolean) => void;
  /** Whether the clip's motion has been read, which click ripples need. */
  motionReady: boolean;
  /** 0 to 1 while the motion is being read, null otherwise. */
  motionProgress: number | null;
  /** Asks to read the motion. The owner confirms first. */
  onReadMotion: () => void;
  looks: Look[];
  /** Asks for a name and saves the current style. */
  onSaveLook: () => void;
  onApplyLook: (look: Look) => void;
  /** Asks to delete a look. The owner confirms first. */
  onDeleteLook: (look: Look) => void;
  /** Sections the panel shows between the frame and the window. */
  children?: React.ReactNode;
}

export function StyleControls({
  options,
  onChange,
  onReset,
  canReset,
  disabled = false,
  kind,
  onMatchPicture,
  showGuides,
  onShowGuidesChange,
  motionReady,
  motionProgress,
  onReadMotion,
  looks,
  onSaveLook,
  onApplyLook,
  onDeleteLook,
  children,
}: StyleControlsProps) {
  const template = getTemplate(options.template);
  const slides = slideCount(template, options.slides);
  const hasGuides = Boolean(template && (template.safe || template.carousel));
  const badged = options.badge.trim().length > 0;
  const activePreset = getGradient(options.gradientId);
  const activeField =
    options.background === "preset" ? shaderFieldOf(activePreset) : null;
  const shades = useShaderSupport();
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
      <LooksSection
        looks={looks}
        options={options}
        onSave={onSaveLook}
        onApply={onApplyLook}
        onDelete={onDeleteLook}
      />

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
            {gradientFamilies.map((family) => (
              <FamilyPicker
                key={family.id}
                family={family}
                shades={shades}
                selectedId={
                  options.background === "preset" ? options.gradientId : null
                }
                angle={options.gradientAngle}
                onPick={(gradientId) =>
                  onChange({
                    gradientId,
                    background: "preset",
                    // A family made to be seen grainy brings its grain, but
                    // only while grain is off, so a chosen strength stays.
                    ...(family.grain !== undefined &&
                      !options.showNoiseOverlay && {
                        showNoiseOverlay: true,
                        noiseIntensity: family.grain,
                      }),
                  })
                }
              />
            ))}
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
            <Button
              variant="secondary"
              onClick={onMatchPicture}
              className="sm:col-span-2"
            >
              <PipetteIcon className="size-3.5" aria-hidden="true" />
              Match the picture
            </Button>
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
                  : activeField
                    ? "A moving background keeps its own direction."
                    : activePreset.kind === "mesh"
                    ? "Mesh gradients do not use an angle."
                    : activePreset.kind === "paper"
                      ? "A sheet of paper does not turn with an angle."
                      : activePreset.kind === "halftone"
                        ? "A halftone screen keeps its own angle."
                        : activePreset.kind === "fluted"
                          ? "Fluted glass stays upright."
                          : "This scene does not turn with an angle."}
            </p>
          )}

          {/* Only for a preset that moves. Still holds the picture, which is
              also how a reader picks the frame a PNG captures, so it brings
              a slider for that moment. */}
          {activeField && (
            <>
              <ChoiceRow
                label="Motion"
                name="background-speed"
                value={String(options.backgroundSpeed)}
                options={BACKGROUND_SPEEDS.map((speed) => ({
                  value: String(speed.value),
                  label: speed.label,
                }))}
                columns={4}
                disabled={!shades}
                onChange={(value) =>
                  onChange({ backgroundSpeed: Number(value) })
                }
              />
              {!shades ? (
                <p className="text-xs text-muted-foreground">
                  This browser cannot draw a moving background, so it shows a
                  still one.
                </p>
              ) : options.backgroundSpeed === 0 ? (
                <SliderRow
                  label="Moment"
                  value={Math.round(options.backgroundMoment * 100)}
                  min={0}
                  max={100}
                  step={1}
                  suffix="%"
                  onChange={(value) =>
                    onChange({ backgroundMoment: value / 100 })
                  }
                />
              ) : null}
            </>
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
        <TemplateRow
          value={options.template}
          onChange={(value) => onChange({ template: value })}
        />

        {template?.carousel && (
          <SliderRow
            label="Carousel slides"
            value={slides}
            min={1}
            max={MAX_SLIDES}
            step={1}
            suffix=""
            onChange={(value) => onChange({ slides: value })}
          />
        )}

        {hasGuides && (
          <ToggleRow
            id="frame-guides"
            label={template?.safe ? "Safe zone guides" : "Slide guides"}
            checked={showGuides}
            onCheckedChange={onShowGuidesChange}
          />
        )}

        {/* A template decides the shape itself, from its own size. */}
        <ChoiceRow
          label="Shape"
          name="aspect"
          value={options.aspect}
          options={aspectOptions}
          columns={4}
          disabled={template !== null}
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

      {children}

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

        <ChoiceRow
          label="Device"
          name="device"
          value={options.device}
          options={deviceOptions}
          onChange={(device) => onChange({ device })}
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

      {/* The same shape as the caption: the rows under the text follow it. */}
      <Section title="Handle">
        <TextRow
          id="badge"
          label="Handle"
          value={options.badge}
          placeholder="@yourname"
          onChange={(badge) => onChange({ badge })}
        />

        <ChoiceRow
          label="Corner"
          name="badge-position"
          value={options.badgePosition}
          options={badgePositionOptions}
          columns={2}
          disabled={!badged}
          onChange={(badgePosition) => onChange({ badgePosition })}
        />

        <SliderRow
          label="Size"
          value={options.badgeSize}
          min={BADGE_SIZE.min}
          max={BADGE_SIZE.max}
          step={BADGE_SIZE.step}
          suffix="px"
          disabled={!badged}
          onChange={(value) => onChange({ badgeSize: value })}
        />

        <ToggleRow
          id="badge-dark"
          label="Light pill"
          checked={options.badgeDark}
          disabled={!badged}
          onCheckedChange={(checked) => onChange({ badgeDark: checked })}
        />
      </Section>

      {kind === "video" && (
        <Section title="Clicks">
          <ToggleRow
            id="click-ripples"
            label="Show each click"
            checked={options.clickRipples}
            onCheckedChange={(checked) => onChange({ clickRipples: checked })}
          />
          {options.clickRipples && !motionReady && (
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {motionProgress !== null
                  ? `Reading the motion, ${Math.round(motionProgress * 100)}%`
                  : "The clicks come from the clip's motion, which has not been read yet."}
              </p>
              <Button
                variant="secondary"
                onClick={onReadMotion}
                disabled={motionProgress !== null}
              >
                {motionProgress !== null && (
                  <Loader2Icon className="size-3.5 animate-spin" aria-hidden="true" />
                )}
                Read the motion
              </Button>
            </div>
          )}
        </Section>
      )}

      <Section title="Depth">
        <ChoiceRow
          label="Shadow"
          name="shadow"
          value={options.shadow}
          options={shadowOptions}
          onChange={(value) => onChange({ shadow: value })}
        />
      </Section>

      {/* Last, and quiet. The panel has no header for this to live in, and a
          header added only to hold it would give a reset more prominence than
          the controls it undoes. Disabled while the style already is the
          default, since a reset that changes nothing is not an action. */}
      <div className="px-5 py-4">
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled || !canReset}
          onClick={onReset}
          className="text-muted-foreground hover:text-foreground"
        >
          <RotateCcwIcon className="size-3.5" aria-hidden="true" />
          Reset the style
        </Button>
      </div>
    </div>
  );
}

/**
 * A panel section that folds to its title, accordion style.
 *
 * The whole header is the trigger, so the section's own name is what a reader
 * presses, and the chevron sits at the far right. Sections fold independently:
 * a reader drawing marks still wants the background open beside them.
 *
 * The body stays mounted and is hidden by height, the same as the trim bar's
 * fold: `grid-template-rows` transitions to `0fr` and `inert` takes the
 * controls out of the tab order while they are out of sight. The clip carries
 * a margin of slack on three sides, taken back by a negative margin, so focus
 * rings and swatch outlines are not cut off at its edges. The body's own top
 * padding is what shows in that slack while folded, so nothing leaks.
 *
 * The header is a plain row with no fill, open or hovered. The ghost button's
 * `aria-expanded` wash is for a trigger holding a menu open, not for a
 * section header, so it is switched off. Hover brightens the chevron instead.
 * It has no press scale either, by request: the chevron turning is the
 * feedback, and a full-width row shrinking on click reads as a jolt.
 *
 * The meta stays on the header when folded, since it is what says what a
 * folded section is set to. Open or closed is view state and is not stored.
 */
export function Section({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const id = useId();

  return (
    <section className="flex flex-col px-5 py-5">
      <h3>
        <Button
          variant="ghost"
          size="sm"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen(!open)}
          className="group -my-1.5 flex w-full justify-between rounded-sm px-0 text-sm font-medium tracking-tight text-foreground hover:bg-transparent hover:text-foreground aria-expanded:bg-transparent active:scale-100"
        >
          <span>{title}</span>
          <span className="flex items-center gap-2 text-[13px] font-normal tracking-normal text-muted-foreground">
            {meta}
            <ChevronDownIcon
              className={cn(
                "size-4 transition-all duration-200 group-hover:text-foreground",
                !open && "-rotate-90"
              )}
              aria-hidden="true"
            />
          </span>
        </Button>
      </h3>
      <div
        id={id}
        inert={!open}
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="-mx-2 -mb-2 min-h-0 overflow-hidden px-2 pb-2">
          <div className="flex flex-col gap-4 pt-4">{children}</div>
        </div>
      </div>
    </section>
  );
}

export function SliderRow({
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
        label={label}
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
  4: "grid-cols-4",
  5: "grid-cols-5",
};

/**
 * Generic over the option value, so a field typed as a union stays one through
 * the control instead of widening to `string` on the way back.
 */
export function ChoiceRow<T extends string>({
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
  columns?: 2 | 3 | 4 | 5;
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

export function TextRow({
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

export function ToggleRow({
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
 * The platform size, grouped by platform. A select rather than chips, because
 * there are two dozen of them and the name is what a reader is looking for.
 */
function TemplateRow({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const template = getTemplate(value);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <FieldLabel htmlFor="template">Size</FieldLabel>
        {template && (
          <Dimensions
            width={template.width}
            height={template.height}
            className="text-[13px] text-muted-foreground"
          />
        )}
      </div>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id="template" aria-label="Platform size">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_TEMPLATE}>
            <span className="flex items-center gap-2">
              <PlatformIcon platform={null} />
              Any size
            </span>
          </SelectItem>
          {platforms.map((platform) => (
            <SelectGroup key={platform.id}>
              <SelectSeparator />
              <SelectLabel>{platform.label}</SelectLabel>
              {templates
                .filter((t) => t.platform === platform.id)
                .map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {/* Inside the item's text, so the trigger shows the
                        selected platform's logo too: it renders this. */}
                    <span className="flex items-center gap-2">
                      <PlatformIcon platform={platform.id} />
                      {`${platform.label} ${t.label}`}
                    </span>
                  </SelectItem>
                ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * Saved looks, first in the panel, since putting one back is the fastest way
 * to style the next capture. Each look is its own gradient as a swatch and
 * its name. The one the style already is carries a check, and pressing it
 * again changes nothing, so it is disabled.
 */
function LooksSection({
  looks,
  options,
  onSave,
  onApply,
  onDelete,
}: {
  looks: Look[];
  options: StyleOptions;
  onSave: () => void;
  onApply: (look: Look) => void;
  onDelete: (look: Look) => void;
}) {
  return (
    <Section title="Saved looks" meta={looks.length ? `${looks.length}` : undefined}>
      {looks.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {looks.map((look) => {
            const current = isLook(options, look);
            const style = { ...options, ...look.style };
            return (
              <li key={look.id} className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={current}
                  onClick={() => onApply(look)}
                  className="min-w-0 flex-1 justify-start px-2 text-[13px] font-normal text-foreground disabled:opacity-100"
                >
                  <span
                    aria-hidden="true"
                    className="size-4 shrink-0 rounded-full border border-stroke"
                    style={{ backgroundImage: resolveGradientCss(style) }}
                  />
                  <span className="truncate">{look.name}</span>
                  {current && (
                    <CheckIcon className="ml-auto size-3.5 text-muted-foreground" aria-hidden="true" />
                  )}
                </Button>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete ${look.name}`}
                      onClick={() => onDelete(look)}
                    >
                      <XIcon className="size-3.5" aria-hidden="true" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Delete this look</TooltipContent>
                </Tooltip>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">
          Save the background, frame, window and handle to use on the next
          capture.
        </p>
      )}
      <Button variant="secondary" onClick={onSave} className="self-start">
        <PlusIcon className="size-3.5" aria-hidden="true" />
        Save the current look
      </Button>
    </Section>
  );
}

/** What a family shows before its fold: one row of the eight-column grid. */
const FAMILY_ROW = 8;

/**
 * One family of preset swatches: a row of them, and the rest behind a fold.
 *
 * A family holds thirty-two presets. Four families open at once is sixteen rows
 * of colour stacked over the angle slider, which pushes every other control in
 * the section off the panel. One row says what a family looks like, and the
 * fold is where a reader goes once they know which family they want.
 *
 * The row is the picker's eight columns. Below `sm` the grid is four columns
 * wide, where eight swatches are two rows: a phone's panel is the full width of
 * the screen, and eight across it leaves a swatch too small to judge a gradient
 * by or to hit with a thumb.
 *
 * The fold transitions the grid row rather than a measured height, and keeps
 * the rows mounted, the same as the trim bar's. `inert` takes them out of the
 * tab order while they are out of sight.
 */
function FamilyPicker({
  family,
  shades,
  selectedId,
  angle,
  onPick,
}: {
  family: { id: GradientFamily; label: string };
  /** Whether moving presets can be drawn, rather than shown as stand-ins. */
  shades: boolean;
  /** The chosen preset's id, or null when the background is not a preset. */
  selectedId: string | null;
  angle: number;
  onPick: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  /** The moving swatch being hovered or focused, which is the one that plays. */
  const [playing, setPlaying] = useState<string | null>(null);
  const presets = gradientPresets.filter(
    (preset) => preset.family === family.id
  );
  const folded = presets.length - FAMILY_ROW;

  // One tab stop per family. It sits on the chosen swatch while that swatch is
  // reachable and on the first otherwise: a swatch behind a closed fold is not,
  // so the family's only stop would be folded away with it.
  const chosen = presets.findIndex((preset) => preset.id === selectedId);
  const reachable = chosen >= 0 && (open || chosen < FAMILY_ROW);
  const stopAt = reachable ? chosen : 0;

  const swatch = (preset: GradientPreset, index: number) => {
    const selected = preset.id === selectedId;
    const field = shades ? shaderFieldOf(preset) : null;
    const play = field ? () => setPlaying(preset.id) : undefined;
    const stop = field
      ? () => setPlaying((id) => (id === preset.id ? null : id))
      : undefined;

    return (
      <button
        key={preset.id}
        type="button"
        title={preset.label}
        aria-pressed={selected}
        onClick={() => onPick(preset.id)}
        onPointerEnter={play}
        onPointerLeave={stop}
        onFocus={play}
        onBlur={stop}
        tabIndex={index === stopAt ? 0 : -1}
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
              supportsAngle(preset) ? angle : undefined
            ),
          }}
        />
        {field && (
          <ShaderSwatch field={field} playing={playing === preset.id} />
        )}
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
  };

  return (
    <div className="flex flex-col gap-2">
      {/* The whole header is the trigger, so the family's name is what a
          reader presses. The dot says the choice is one of the folded ones,
          which is otherwise the one state the row cannot show. */}
      <Button
        variant="ghost"
        size="sm"
        aria-expanded={open}
        aria-controls={`${family.id}-folded`}
        onClick={() => setOpen(!open)}
        className="-mx-2 justify-between px-2 text-[13px] font-normal"
      >
        <span>{family.label}</span>
        <span className="flex items-center gap-1.5">
          {chosen >= FAMILY_ROW && !open && (
            <span
              aria-hidden="true"
              className="inline-block size-1 shrink-0 rounded-full bg-brand"
            />
          )}
          {open ? "Fewer" : `${folded} more`}
          <ChevronDownIcon
            className={cn(
              "size-3.5 transition-transform duration-200",
              open && "rotate-180"
            )}
            aria-hidden="true"
          />
        </span>
      </Button>

      <RovingGrid label={`${family.label} backgrounds`}>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
          {presets.slice(0, FAMILY_ROW).map(swatch)}
        </div>

        <div
          id={`${family.id}-folded`}
          inert={!open}
          className={cn(
            "grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none",
            open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          )}
        >
          {/* The clip cuts the outline off the swatches along its edges, so the
              box is given that much slack and pulled back by the same, which
              leaves the two grids aligned to the pixel. */}
          <div className="-mx-1 min-h-0 overflow-hidden px-1">
            <div className="grid grid-cols-4 gap-2 pt-2 pb-1 sm:grid-cols-8">
              {presets
                .slice(FAMILY_ROW)
                .map((preset, index) => swatch(preset, index + FAMILY_ROW))}
            </div>
          </div>
        </div>
      </RovingGrid>
    </div>
  );
}

/**
 * A grid whose items share one tab stop and are walked with the arrow keys.
 *
 * The background picker is a hundred and twenty-eight swatches. As that many
 * tab stops it is a wall between the panel's first control and its second, and
 * a reader not looking for a background has to walk all of it. One stop per
 * family and the arrows inside is what a set of related choices is supposed to
 * do. A family's folded rows are walked too, once the fold is open.
 *
 * Navigation is linear rather than by row and column. The grid is four columns
 * at one width and eight at another, so a Down that means "one row" would have
 * to measure the layout to know what a row is, and would be wrong whenever it
 * guessed. Next and previous are right at any column count.
 */
function RovingGrid({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const move = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const keys = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"];
    if (!keys.includes(event.key)) return;

    const items = [
      ...event.currentTarget.querySelectorAll<HTMLButtonElement>("button"),
      // A swatch behind a closed fold cannot take focus, so walking onto it
      // would look like the arrow keys dying at the end of the visible row.
    ].filter((item) => !item.disabled && !item.closest("[inert]"));
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
    <div role="group" aria-label={label} onKeyDown={move}>
      {children}
    </div>
  );
}

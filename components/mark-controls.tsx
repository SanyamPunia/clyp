"use client";

import { Trash2Icon } from "lucide-react";

import { ChoiceRow, Section, TextRow } from "@/components/style-controls";
import { Button } from "@/components/ui/button";
import { FieldLabel } from "@/components/ui/field-label";
import { SegmentedGroup, SegmentedOption } from "@/components/ui/segmented";
import {
  type Mark,
  type MarkColor,
  type MarkKind,
  DEFAULT_TEXT_SIZE,
  MARK_COLORS,
  TEXT_SIZES,
  markColors,
  markKinds,
} from "@/lib/marks";
import { cn } from "@/lib/utils";

/** The tool row's own value for "no tool", since a radio needs a string. */
const SELECT = "select";

const COLOR_NAMES: Record<MarkColor, string> = {
  red: "Red",
  yellow: "Yellow",
  green: "Green",
  blue: "Blue",
  white: "White",
  black: "Black",
};

/**
 * The tools for marking the picture up, and the selected mark's own settings.
 *
 * The tool decides what a press on the picture draws. Select draws nothing,
 * so a press on a clip still plays it. The colour applies to the next mark
 * drawn and to the selected one, and is disabled for a blur, which has none.
 */
export function MarkControls({
  marks,
  selected,
  tool,
  color,
  onToolChange,
  onColorChange,
  onChange,
  onRemove,
}: {
  marks: Mark[];
  selected: Mark | null;
  tool: MarkKind | null;
  color: MarkColor;
  onToolChange: (tool: MarkKind | null) => void;
  onColorChange: (color: MarkColor) => void;
  onChange: (mark: Mark) => void;
  /** Asks to remove the selected mark. The owner confirms first. */
  onRemove: () => void;
}) {
  const colorless =
    selected ? selected.kind === "blur" : tool === "blur";

  return (
    <Section
      title="Marks"
      meta={marks.length ? `${marks.length} on the picture` : undefined}
    >
      <div className="flex flex-col gap-2">
        <FieldLabel>Tool</FieldLabel>
        <SegmentedGroup
          value={tool ?? SELECT}
          onValueChange={(value) =>
            onToolChange(value === SELECT ? null : (value as MarkKind))
          }
          className="grid-cols-3"
        >
          {[{ value: SELECT, label: "Select" }, ...markKinds].map((option) => (
            <SegmentedOption
              key={option.value}
              id={`mark-tool-${option.value}`}
              value={option.value}
              selected={(tool ?? SELECT) === option.value}
              className="h-8"
            >
              {option.label}
            </SegmentedOption>
          ))}
        </SegmentedGroup>
        <p className="text-xs text-muted-foreground">
          {tool === "text"
            ? "Press on the picture to place text."
            : tool
              ? "Drag on the picture to draw."
              : "Press a mark to select it. Arrow keys move it, Delete removes it."}
        </p>
      </div>

      <div
        className={cn(
          "flex flex-col gap-2 transition-opacity duration-150",
          colorless && "opacity-50",
        )}
      >
        <FieldLabel>Colour</FieldLabel>
        <SegmentedGroup
          value={selected?.color ?? color}
          onValueChange={(value) => {
            const next = value as MarkColor;
            onColorChange(next);
            if (selected && selected.kind !== "blur") {
              onChange({ ...selected, color: next });
            }
          }}
          className="grid-cols-6"
        >
          {markColors.map((c) => (
            <SegmentedOption
              key={c}
              id={`mark-color-${c}`}
              value={c}
              selected={(selected?.color ?? color) === c}
              disabled={colorless}
              title={COLOR_NAMES[c]}
              className="h-8"
            >
              <span
                aria-hidden="true"
                className="size-4 rounded-full border border-stroke-strong"
                style={{ backgroundColor: MARK_COLORS[c] }}
              />
              <span className="sr-only">{COLOR_NAMES[c]}</span>
            </SegmentedOption>
          ))}
        </SegmentedGroup>
      </div>

      {selected?.kind === "text" && (
        <>
          <TextRow
            id="mark-text"
            label="Text"
            value={selected.text ?? ""}
            placeholder="Text"
            onChange={(text) => onChange({ ...selected, text })}
          />
          <ChoiceRow
            label="Text size"
            name="mark-text-size"
            value={String(selected.size ?? DEFAULT_TEXT_SIZE)}
            options={TEXT_SIZES.map((s) => ({
              value: String(s.value),
              label: s.label,
            }))}
            onChange={(size) => onChange({ ...selected, size: Number(size) })}
          />
        </>
      )}

      {selected && (
        <Button
          variant="ghost"
          onClick={onRemove}
          className="self-start text-muted-foreground hover:text-foreground"
        >
          <Trash2Icon className="size-3.5" aria-hidden="true" />
          Remove this mark
        </Button>
      )}
    </Section>
  );
}

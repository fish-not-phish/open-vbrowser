"use client";

import * as React from "react";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

interface LimitSliderProps {
  value: number | null;
  onChange: (v: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  unlimitedLabel?: string;
  allowUnlimited?: boolean;   // false = no unlimited sentinel, slider just goes min..max
  disabled?: boolean;
  className?: string;
}

export function LimitSlider({
  value,
  onChange,
  min = 1,
  max = 24,
  step = 1,
  unit = "",
  unlimitedLabel = "Unlimited",
  allowUnlimited = true,
  disabled = false,
  className,
}: LimitSliderProps) {
  const sliderMax = allowUnlimited ? max + step : max;
  const unlimitedSentinel = max + step;
  const isUnlimited = allowUnlimited && value === null;

  const sliderValue = isUnlimited
    ? unlimitedSentinel
    : Math.min(Math.max(value ?? min, min), max);

  function handleChange([raw]: number[]) {
    if (allowUnlimited && raw >= unlimitedSentinel) {
      onChange(null);
    } else {
      onChange(raw);
    }
  }

  return (
    <div className={cn("flex flex-col gap-2 w-full", className)}>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground tabular-nums">{min}{unit && ` ${unit}`}</span>
        <span className={cn("text-sm font-semibold tabular-nums transition-colors", isUnlimited ? "text-primary" : "text-foreground")}>
          {isUnlimited ? unlimitedLabel : `${value ?? min}${unit ? ` ${unit}` : ""}`}
        </span>
        <span className={cn("text-xs tabular-nums", allowUnlimited ? "text-primary" : "text-muted-foreground")}>
          {allowUnlimited ? unlimitedLabel : `${max}${unit ? ` ${unit}` : ""}`}
        </span>
      </div>
      <Slider
        min={min}
        max={sliderMax}
        step={step}
        value={[sliderValue]}
        onValueChange={handleChange}
        disabled={disabled}
        className={cn(
          "[&_[role=slider]]:transition-colors",
          isUnlimited && "[&_[role=slider]]:border-primary [&_[role=slider]]:bg-primary"
        )}
      />
    </div>
  );
}

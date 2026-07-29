import * as React from "react";
import { cn } from "@/lib/utils";

export type SliderProps = Omit<React.ComponentProps<"input">, "type" | "value" | "onChange"> & {
  value?: number[];
  min?: number;
  max?: number;
  step?: number;
  onValueChange?: (value: number[]) => void;
};

export function Slider({
  className,
  value = [0],
  min = 0,
  max = 100,
  step = 1,
  onValueChange,
  ...props
}: SliderProps) {
  return (
    <input
      type="range"
      className={cn(
        "accent-primary h-2 w-full cursor-pointer appearance-none rounded-full bg-secondary",
        className
      )}
      min={min}
      max={max}
      step={step}
      value={value[0]}
      onChange={(event) => onValueChange?.([Number(event.target.value)])}
      {...props}
    />
  );
}

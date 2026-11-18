"use client";

import * as React from "react";
import { Input } from "./input";

// Native <input type="time"> renders AM/PM on devices whose OS/browser
// locale defaults to 12-hour — not something fixable via HTML attributes.
// This is a plain digit-driven text input that always displays/emits 24h
// "HH:mm", so every platform looks the same.

type Props = Omit<React.ComponentProps<"input">, "type" | "value" | "defaultValue" | "onChange"> & {
  value?: string;
  defaultValue?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  ref?: React.Ref<HTMLInputElement>;
};

function toDigits(v: string | undefined): string {
  return (v ?? "").replace(/\D/g, "").slice(0, 4);
}

function display(digits: string): string {
  return digits.length <= 2 ? digits : `${digits.slice(0, 2)}:${digits.slice(2, 4)}`;
}

function normalize(digits: string): string {
  const hh = Math.min(23, parseInt(digits.slice(0, 2).padEnd(2, "0") || "0", 10));
  const mm = Math.min(59, parseInt(digits.slice(2, 4).padEnd(2, "0") || "0", 10));
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export function TimeInput({ value, defaultValue, onChange, onBlur, ref, ...props }: Props) {
  const isControlled = value !== undefined;
  const [digits, setDigits] = React.useState(() => toDigits(value ?? defaultValue));
  const [lastValue, setLastValue] = React.useState(value);

  // Sync from a controlled `value` prop change during render (not an effect)
  // so an external reset — e.g. react-hook-form's form.reset() — is reflected
  // immediately instead of one render late.
  if (isControlled && value !== lastValue) {
    setLastValue(value);
    setDigits(toDigits(value));
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = toDigits(e.target.value);
    setDigits(next);
    e.target.value = display(next);
    onChange?.(e);
  }

  function handleBlur(e: React.FocusEvent<HTMLInputElement>) {
    if (digits.length > 0) {
      const normalized = normalize(digits);
      setDigits(normalized.replace(":", ""));
      e.target.value = normalized;
      onChange?.(e as unknown as React.ChangeEvent<HTMLInputElement>);
    }
    onBlur?.(e);
  }

  return (
    <Input
      ref={ref}
      type="text"
      inputMode="numeric"
      placeholder="HH:mm"
      maxLength={5}
      value={display(digits)}
      onChange={handleChange}
      onBlur={handleBlur}
      {...props}
    />
  );
}

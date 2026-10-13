import { useEffect, useState } from 'react';

/**
 * Numeric input that can be cleared and retyped freely. Valid in-range values
 * are applied as you type; anything else is clamped (or reverted, if empty)
 * when the field loses focus or Enter is pressed.
 */
export function NumberField({
  value,
  onChange,
  min = 0,
  max = Infinity,
  step,
  className,
  'aria-label': ariaLabel,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
  'aria-label'?: string;
}) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);

  // Follow outside changes (undo, switching diagrams) unless the user is mid-edit.
  useEffect(() => {
    if (!focused) setText(String(value));
  }, [value, focused]);

  const parse = (t: string) => (t.trim() === '' ? NaN : Number(t));

  const finish = () => {
    const n = parse(text);
    const next = Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : value;
    if (next !== value) onChange(next);
    setText(String(next));
  };

  return (
    <input
      type="number"
      inputMode="decimal"
      className={className}
      aria-label={ariaLabel}
      min={min}
      max={Number.isFinite(max) ? max : undefined}
      step={step}
      value={text}
      onFocus={(e) => {
        setFocused(true);
        e.target.select();
      }}
      onChange={(e) => {
        setText(e.target.value);
        const n = parse(e.target.value);
        if (Number.isFinite(n) && n >= min && n <= max && n !== value) onChange(n);
      }}
      onBlur={() => {
        setFocused(false);
        finish();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

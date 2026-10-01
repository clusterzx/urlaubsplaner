import { useEffect, useState } from 'react';

interface Props {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  id?: string;
  'aria-label'?: string;
}

const format = (v: number) => String(v).replace('.', ',');
const parse = (text: string) => Number(text.trim().replace(',', '.'));

/** Zahlenfeld, das Komma und Punkt akzeptiert und Zwischenstände („7,“) beim Tippen nicht verwirft. */
export function NumberInput({ value, onChange, min = 0, max = 9999, id, ...rest }: Props) {
  const [draft, setDraft] = useState(format(value));

  useEffect(() => {
    setDraft((d) => (parse(d) === value ? d : format(value)));
  }, [value]);

  return (
    <input
      id={id}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      aria-label={rest['aria-label']}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        const v = parse(e.target.value);
        if (e.target.value.trim() !== '' && Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)));
      }}
      onBlur={() => setDraft(format(value))}
    />
  );
}

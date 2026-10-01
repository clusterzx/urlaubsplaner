import { useEffect, useState } from 'react';

// localStorage kann (z. B. im privaten Modus oder in eingebetteten Ansichten) fehlen oder werfen.
function read(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? undefined : JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function write(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Speichern ist optional.
  }
}

/** useState, der seinen Wert im Browser speichert. `sanitize` prüft gespeicherte Werte. */
export function usePersistentState<T>(key: string, sanitize: (raw: unknown) => T) {
  const [value, setValue] = useState<T>(() => sanitize(read(key)));
  useEffect(() => write(key, value), [key, value]);
  return [value, setValue] as const;
}

import strip from 'strip-ansi';

/**
 * Pads a value with a space or a specified delimiter to match a given width.
 */
export function pad(value: string | string[], width: number, delimiter?: string): string {
  const str = Array.isArray(value) ? value.join() : value;
  return str + (delimiter || ' ').repeat(Math.max(0, Math.floor(width) - strip(str).length));
}

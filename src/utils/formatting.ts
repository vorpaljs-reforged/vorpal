import strip from 'strip-ansi';
import {Arg} from '../command';

export const PADDING = '  ';
export const PADDING_SIZE = PADDING.length;

/**
 * Pads a value with a space or a specified delimiter to match a given width.
 */
export function pad(value: string | string[], width: number, delimiter?: string): string {
  const str = Array.isArray(value) ? value.join() : value;
  return str + (delimiter || ' ').repeat(Math.max(0, Math.floor(width) - strip(str).length));
}

/**
 * Pad a row on the start and end with spaces.
 */
export function padRow(value: string): string {
  return value
    .split('\n')
    .map(row => PADDING + row + PADDING)
    .join('\n');
}

/**
 * Formats an array for display in a TTY in a pretty fashion.
 */
export function prettifyArray(baseArray?: string[]): string {
  const array = baseArray ? [...baseArray] : [];

  // Calculate widths
  // $FlowIgnore `columns` is not defined
  const maxWidth = process.stdout.columns;
  const longestWidth =
    array.reduce((longest, item) => {
      const {length} = strip(item);

      return length > longest ? length : longest;
    }, 0) + PADDING_SIZE;
  const fullWidth = strip(array.join('')).length;

  // Does it fit on one line?
  if (fullWidth + array.length * PADDING_SIZE <= maxWidth) {
    return array.join('  ');
  }

  // Generate the output
  const lines = [];
  const cols = Math.min(1, Math.floor(maxWidth / longestWidth));
  let line = '';
  let col = 0;

  array.forEach(item => {
    if (col < cols) {
      col += 1;
    } else {
      lines.push(line);
      line = '';
      col = 1;
    }

    line += pad(item, longestWidth);
  });

  if (line !== '') {
    lines.push(line);
  }

  return lines.join('\n');
}

/**
 * Makes an argument name pretty for help.
 */
export function humanReadableArgName(arg: Arg): string {
  const name = arg.name + (arg.variadic ? '...' : '');

  return arg.required ? `<${name}>` : `[${name}]`;
}

import {PADDING} from '../constants';

/**
 * Pad a row on the start and end with spaces.
 */
export function padRow(value: string): string {
  return value
    .split('\n')
    .map(row => PADDING + row + PADDING)
    .join('\n');
}

import {Arg} from '../command';

/**
 * Makes an argument name pretty for help.
 */
export function humanReadableArgName(arg: Arg): string {
  const name = arg.name + (arg.variadic ? '...' : '');

  return arg.required ? `<${name}>` : `[${name}]`;
}

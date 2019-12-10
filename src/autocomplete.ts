import { clone, noop } from 'lodash';
import strip from 'strip-ansi';
import {
  assembleInput,
  filterData,
  getCommandNames,
  getMatch,
  getMatchData,
  getMatchObject,
  handleTabCounts,
  parseInput,
  parseMatchSection
} from './autocomplete-utils';
import Command from './command';
import Session from './session';

export interface Input<T extends AutocompleteMatch = AutocompleteMatch> {
  raw: string;
  prefix: string;
  suffix: string;
  context: T; // Is string when match is a Command, string[] otherwise
  match?: Command;
  option?: string;
}

export interface AutocompleteOptions {
  ignoreSlashes?: boolean;
}

export type AutocompleteMatch = string | string[];

export type AutocompleteCallback<T = AutocompleteMatch> = (data: T) => unknown;

export type AutocompleteConfigCallback = (error: Error | undefined, arr: AutocompleteMatch) => void;

export type AutocompleteConfigFn = (
  input: AutocompleteMatch,
  callback: AutocompleteConfigCallback
) => string[];

export type AutocompleteConfig = string[] | { data: AutocompleteConfigFn };

const autocomplete = {
  /**
   * Handles tabbed autocompletion.
   *
   * - Initial tabbing lists all registered commands.
   * - Completes a command halfway typed.
   * - Recognizes options and lists all possible options.
   * - Recognizes option arguments and lists them.
   * - Supports cursor positions anywhere in the string.
   * - Supports piping.
   */
  exec(this: Session, str?: string, cb: AutocompleteConfigCallback = noop) {
    let input = parseInput(str, this.parent.ui._activePrompt.screen.rl.cursor);
    const commands = getCommandNames(this.parent.commands);
    const vorpalMatch = getMatch(input.context as string, commands, { ignoreSlashes: true });
    let freezeTabs = false;

    const end = (innerStr: AutocompleteMatch) => {
      const res = handleTabCounts.call(this, innerStr, freezeTabs);
      cb(undefined, res || '');
    };

    const evaluateTabs = (innerInput: Input) => {
      if (innerInput.context && innerInput.context[innerInput.context.length - 1] === '/') {
        freezeTabs = true;
      }
    };

    if (vorpalMatch) {
      input.context = vorpalMatch;
      evaluateTabs(input);
      end(assembleInput(input));
      return;
    }

    input = getMatchObject.call(this, input, commands);

    if (input.match) {
      input = parseMatchSection.call(this, input as Input<string>);
      getMatchData.call(this, input, function(data) {
        const dataMatch = getMatch(input.context as string, data as string[]);
        if (dataMatch) {
          input.context = dataMatch;
          evaluateTabs(input);
          end(assembleInput(input));
        } else {
          end(filterData(input.context as string, data as string[]));
        }
      });
    } else {
      end(filterData(input.context as string, commands));
    }
  },

  /**
   * Independent / stateless auto-complete function.
   * Parses an array of strings for the best match.
   */
  match(str: string, arr: string[] = [], options: AutocompleteOptions = {}) {
    arr.sort();
    const arrX = clone(arr);
    let strX = String(str);

    let prefix = '';

    if (options.ignoreSlashes !== true) {
      const parts = strX.split('/');
      strX = parts.pop() || '';
      prefix = parts.join('/');
      prefix = parts.length > 0 ? prefix + '/' : prefix;
    }

    const matches: string[] = [];
    for (let i = 0; i < arrX.length; i++) {
      if (strip(arrX[i]).slice(0, strX.length) === strX) {
        matches.push(arrX[i]);
      }
    }
    if (matches.length === 1) {
      // If we have a slash, don't add a space after match.
      const space =
        String(strip(matches[0])).slice(strip(matches[0]).length - 1) === '/' ? '' : ' ';
      return prefix + matches[0] + space;
    } else if (matches.length === 0) {
      return undefined;
    } else if (strX.length === 0) {
      return matches;
    }

    const longestMatchLength = matches.reduce(function(previous, current) {
      for (let i = 0; i < current.length; i++) {
        if (previous[i] && current[i] !== previous[i]) {
          return current.substr(0, i);
        }
      }
      return previous;
    }).length;

    // couldn't resolve any further, return all matches
    if (longestMatchLength === strX.length) {
      return matches;
    }

    // return the longest matching portion along with the prefix
    return prefix + matches[0].substr(0, longestMatchLength);
  }
};

export default autocomplete;

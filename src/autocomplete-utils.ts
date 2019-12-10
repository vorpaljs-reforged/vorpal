import _ from 'lodash';
import strip from 'strip-ansi';
import autocomplete, { AutocompleteConfig, AutocompleteConfigCallback } from './autocomplete';
import {
  AutocompleteCallback,
  AutocompleteConfigFn,
  AutocompleteMatch,
  AutocompleteOptions,
  Input
} from './autocomplete';
import Session from './session';
import Command from 'command';

/**
 * Tracks how many times tab was pressed
 * based on whether the UI changed.
 */
export function handleTabCounts(this: Session, match: AutocompleteMatch, freezeTabs: boolean) {
  let result: AutocompleteMatch | undefined;
  if (Array.isArray(match)) {
    this._tabCount += 1;
    if (this._tabCount > 1) {
      result = match.length === 0 ? undefined : match;
    }
  } else {
    this._tabCount = freezeTabs === true ? this._tabCount + 1 : 0;
    result = match;
  }
  return result;
}

/**
 * Looks for a potential exact match
 * based on given data.
 */
export function getMatch(ctx: string, data: string[], options?: AutocompleteOptions) {
  // Look for a command match, eliminating and then
  // re-introducing leading spaces.
  const len = ctx.length;
  const trimmed = ctx.trimLeft();
  const match = autocomplete.match(trimmed, data.slice(), options);
  if (Array.isArray(match)) {
    return match;
  }
  const prefix = new Array(len - trimmed.length + 1).join(' ');

  // If we get an autocomplete match on a command, put the leading spaces back in and finish it.
  return match ? prefix + match : undefined;
}

/**
 * Takes the input object and assembles
 * the final result to display on the screen.
 */
export function assembleInput(input: Input) {
  if (Array.isArray(input.context)) {
    return input.context;
  }
  const result = (input.prefix || '') + (input.context || '') + (input.suffix || '');
  return strip(result);
}

/**
 * Reduces an array of possible
 * matches to list based on a given
 * string.
 */
export function filterData(str = '', data: string[]) {
  data = data || [];
  let ctx = String(str).trim();
  const slashParts = ctx.split('/');
  ctx = slashParts.pop() || '';
  const wordParts = String(ctx)
    .trim()
    .split(' ');

  return data
    .filter(function(item) {
      return strip(item).slice(0, ctx.length) === ctx;
    })
    .map(function(item) {
      let parts = String(item)
        .trim()
        .split(' ');
      if (parts.length > 1) {
        parts = parts.slice(wordParts.length);
        return parts.join(' ');
      }
      return item;
    });
}

/**
 * Returns a cleaned up version of the
 * remaining text to the right of the cursor.
 *
 * @param {String} suffix
 * @return {String}
 * @api private
 */
export function getSuffix(suffix: string) {
  suffix = suffix.slice(0, 1) === ' ' ? suffix : suffix.replace(/.+?(?=\s)/, '');
  suffix = suffix.slice(1, suffix.length);
  return suffix;
}

/**
 * Takes the user's current prompt
 * string and breaks it into its
 * integral parts for analysis and
 * modification.
 */
export function parseInput(str = '', idx: number) {
  const raw = String(str);
  const sliced = raw.slice(0, idx);
  const sections = sliced.split('|');
  const prefixParts = sections.slice(0, sections.length - 1) || [];
  prefixParts.push('');
  const prefix = prefixParts.join('|');
  const suffix = getSuffix(raw.slice(idx));
  const context = sections[sections.length - 1];
  return {
    raw,
    prefix,
    suffix,
    context
  } as Input;
}

/**
 * Takes the context after a
 * matched command and figures
 * out the applicable context,
 * including assigning its role
 * such as being an option
 * parameter, etc.
 */
export function parseMatchSection(input: Input<string>) {
  const parts = (input.context || '').split(' ');
  const last = parts.pop();
  const beforeLast = strip(parts[parts.length - 1] || '').trim();
  if (beforeLast.slice(0, 1) === '-') {
    input.option = beforeLast;
  }
  input.context = last || '';
  input.prefix = (input.prefix || '') + parts.join(' ') + ' ';
  return input;
}

/**
 * Compile all available commands and aliases
 * in alphabetical order.
 */
export function getCommandNames(cmds: Command[]): string[] {
  const commands = _.map(cmds, '_name').concat(..._.map(cmds, '_aliases'));
  commands.sort();
  return commands;
}

/**
 * When we know that we've
 * exceeded a known command, grab
 * on to that command and return it,
 * fixing the overall input context
 * at the same time.
 */
export function getMatchObject(this: Session, input: Input, commandNames: string[]) {
  const len = input.context.length;
  const trimmed = String(input.context).trimLeft();
  let prefix: AutocompleteMatch = new Array(len - trimmed.length + 1).join(' ');
  let suffix: AutocompleteMatch = '';
  let match: string | undefined;

  commandNames.forEach(function(cmd) {
    const nextChar = trimmed.substr(cmd.length, 1);
    if (trimmed.substr(0, cmd.length) === cmd && String(cmd).trim() !== '' && nextChar === ' ') {
      match = cmd;
      suffix = trimmed.substr(cmd.length);
      prefix += trimmed.substr(0, cmd.length);
    }
  });

  let matchObject: Command | undefined = match
    ? this.parent.commands.find(command => command._name === String(match).trim())
    : undefined;

  if (!matchObject) {
    this.parent.commands.forEach(function(cmd) {
      if ((cmd._aliases || []).indexOf(String(match).trim()) > -1) {
        matchObject = cmd;
      }
      return;
    });
  }

  if (!matchObject) {
    matchObject = this.parent.commands.find(
      cmd => cmd._catch !== null && typeof cmd._catch !== 'undefined'
    );
    if (matchObject) {
      suffix = input.context;
    }
  }

  if (!matchObject) {
    prefix = input.context;
    suffix = '';
  }

  if (matchObject) {
    input.match = matchObject;
    input.prefix += prefix;
    input.context = suffix;
  }

  return input;
}

function handleDataFormat(
  str: AutocompleteMatch,
  config: AutocompleteConfig | AutocompleteConfigFn,
  cb: AutocompleteCallback
) {
  let data: string[] = [];
  if (Array.isArray(config)) {
    data = config;
  } else if (typeof config === 'function') {
    const cbk: AutocompleteConfigCallback =
      config.length < 2
        ? // eslint-disable-next-line @typescript-eslint/no-empty-function
          function() {}
        : // eslint-disable-next-line @typescript-eslint/no-explicit-any
          function(err: any, resp: AutocompleteMatch) {
            cb(resp || []);
          };
    const res = config(str, cbk);

    if (res instanceof Promise) {
      res
        .then(function(resp) {
          cb(resp);
        })
        .catch(function(err) {
          cb(err);
        });
    } else if (config.length < 2) {
      cb(res);
    }
  } else {
    cb(data);
  }
}

/**
 * Takes a known matched command, and reads
 * the applicable data by calling its autocompletion
 * instructions, whether it is the command's
 * autocompletion or one of its options.
 */
export function getMatchData(input: Input, cb: AutocompleteCallback<AutocompleteMatch>) {
  const string = input.context;
  const cmd = input.match;
  const midOption =
    String(string)
      .trim()
      .slice(0, 1) === '-';
  const afterOption = input.option !== undefined;

  if (!cmd) {
    return;
  }

  if (midOption === true && !cmd._allowUnknownOptions) {
    const results = [];
    for (let i = 0; i < cmd.options.length; ++i) {
      const long = cmd.options[i].long;
      const short = cmd.options[i].short;
      if (!long && short) {
        results.push(short);
      } else if (long) {
        results.push(long);
      }
    }
    cb(results);
    return;
  }

  if (afterOption === true) {
    const opt = strip(input.option || '').trim();
    const match = cmd.options.find(o => o.short === opt || o.long === opt);
    if (match) {
      const config = match.autocomplete;
      config && handleDataFormat(string, config, cb);
      return;
    }
  }

  const conf = cmd._autocomplete;
  const confFn = conf && !Array.isArray(conf) && conf.data ? conf.data : conf;
  confFn && handleDataFormat(string, confFn, cb);
}

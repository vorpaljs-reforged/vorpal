import strip from 'strip-ansi';
import {isFunction, isNil} from 'lodash';
import autocomplete from './autocomplete';
import {
  AutocompleteCallback,
  AutocompleteConfigFn,
  AutocompleteMatch,
  AutocompleteOptions,
  IAutocompleteConfig,
  Input
} from './types/autocomplete';
import {ICommand, IVorpal} from './types/types';

/**
 * Tracks how many times tab was pressed
 * based on whether the UI changed.
 *
 * @param {AutocompleteMatch} match
 * @param {Boolean} freezeTabs
 * @return {String} result
 * @api private
 */
export function handleTabCounts(match: AutocompleteMatch, freezeTabs: boolean): AutocompleteMatch {
  let result;
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
 *
 * @param {String} ctx
 * @param {Array} data
 * @param {Object} options
 * @return {String}
 * @api private
 */
export function getMatch(
  ctx: string,
  data: string[],
  options?: AutocompleteOptions
): AutocompleteMatch {
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
 *
 * @param {Object} input
 * @return {AutocompleteMatch}
 * @api private
 */
export function assembleInput(input: Input): AutocompleteMatch {
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
 *
 * @param {String} str
 * @param {Array} data
 * @return {Array}
 * @api private
 */
export function filterData(str = '', data: string[]) {
  data = data || [];
  let ctx = String(str).trim();
  const slashParts = ctx.split('/');
  ctx = slashParts.pop();
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
 *
 * @param {String} str
 * @param {Number} idx
 * @return {Object}
 * @api private
 */
export function parseInput(str = '', idx: number): Input {
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
  };
}

/**
 * Takes the context after a
 * matched command and figures
 * out the applicable context,
 * including assigning its role
 * such as being an option
 * parameter, etc.
 *
 * @param {Object} input
 * @return {Object}
 * @api private
 */
export function parseMatchSection(input: Input<string>) {
  const parts = (input.context || '').split(' ');
  const last = parts.pop();
  const beforeLast = strip(parts[parts.length - 1] || '').trim();
  if (beforeLast.slice(0, 1) === '-') {
    input.option = beforeLast;
  }
  input.context = last;
  input.prefix = (input.prefix || '') + parts.join(' ') + ' ';
  return input;
}

/**
 * Compile all available commands and aliases
 * in alphabetical order.
 *
 * @param {Array} commands
 * @return {Array}
 * @api private
 */
export function getCommandNames(commands: ICommand[]): string[] {
  return commands
    .map(command => command._name)
    .concat(...commands.map(command => command._aliases))
    .sort();
}

/**
 * When we know that we've
 * exceeded a known command, grab
 * on to that command and return it,
 * fixing the overall input context
 * at the same time.
 *
 * @param {Object} input
 * @param {Array} commandNames
 * @return {Object}
 * @api private
 */
export function getMatchObject(this: IVorpal, input: Input<string>, commandNames: string[]) {
  const len = input.context.length;
  const trimmed = String(input.context).trimLeft();
  let prefix = new Array(len - trimmed.length + 1).join(' ');
  let match: string;
  let suffix;

  commandNames.forEach(function(cmd) {
    const nextChar = trimmed.substr(cmd.length, 1);
    if (trimmed.substr(0, cmd.length) === cmd && String(cmd).trim() !== '' && nextChar === ' ') {
      match = cmd;
      suffix = trimmed.substr(cmd.length);
      prefix += trimmed.substr(0, cmd.length);
    }
  });

  let matchObject: ICommand = match
    ? this.parent.commands.find(command => command._name === String(match).trim())
    : undefined;

  if (!matchObject) {
    this.parent.commands.forEach(cmd => {
      if ((cmd._aliases || []).indexOf(String(match).trim()) > -1) {
        matchObject = cmd;
      }
      return;
    });
  }

  if (!matchObject) {
    matchObject = this.parent.commands.find(cmd => !isNil(cmd._catch));
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
  config: IAutocompleteConfig | AutocompleteConfigFn,
  cb: AutocompleteCallback
) {
  let data: string[] = [];
  if (Array.isArray(config)) {
    data = config;
  } else if (isFunction(config)) {
    const cbk =
      config.length < 2
        ? // eslint-disable-next-line @typescript-eslint/no-empty-function
          function() {}
        : function(err, resp: string[]) {
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
 *
 * @param {Object} input
 * @param {Function} cb
 * @return {Array}
 * @api private
 */
export function getMatchData(input: Input<string>, cb: AutocompleteCallback) {
  const string = input.context;
  const cmd = input.match;
  const midOption =
    String(string)
      .trim()
      .slice(0, 1) === '-';
  const afterOption = input.option !== undefined;

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
    const opt = strip(input.option).trim();
    const match = cmd.options.find(o => o.short === opt || o.long === opt);
    if (match) {
      const config = match.autocomplete;
      handleDataFormat(string, config, cb);
      return;
    }
  }

  const conf = cmd._autocomplete;
  const confFn = conf && !Array.isArray(conf) && conf.data ? conf.data : conf;
  handleDataFormat(string, confFn, cb);
}

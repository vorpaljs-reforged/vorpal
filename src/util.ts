import _, { forEach, range, some, isFunction, find, map } from 'lodash';
import minimist from 'minimist';
import strip from 'strip-ansi';

import Command, { Arg } from './command';
import { QueuedCommand } from 'vorpal';
import { CommandArgs } from './command-instance';

export type CommandMatch = {
  command?: Command;
  args?: string | CommandArgs;
  downstream?: CommandMatch;
};

/**
 * Parses command arguments from multiple
 * sources.
 */
function parseArgs(str: string, opts?: minimist.Opts) {
  // TODO figure out what this regex does and add comment
  const reg = /"(.*?)"|'(.*?)'|`(.*?)`|([^\s"]+)/gi;
  const array = [];
  let match;
  do {
    match = reg.exec(str);
    if (match !== null) {
      // TODO check why, array is overwritten after
      array.push(match[1] || match[2] || match[3] || match[4]);
    }
  } while (match !== null);

  const parsedArray = minimist(array, opts);
  parsedArray._ = parsedArray._ || [];
  return parsedArray;
}

/**
 * Run a raw command string, e.g. foo -bar
 * against a given list of commands,
 * and if there is a match, parse the
 * results.
 */
function matchCommand(cmd: string, cmds: Command[]): CommandMatch {
  const parts = String(cmd)
    .trim()
    .split(' ');

  let match;
  let matchArgs;
  for (let i = 0; i < parts.length; ++i) {
    const subcommand = String(parts.slice(0, parts.length - i).join(' ')).trim();
    match = find(cmds, { _name: subcommand }) || match;
    if (!match) {
      for (const command of Object.values(cmds)) {
        const idx = command._aliases.indexOf(subcommand);
        match = idx > -1 ? command : match;
      }
    }
    if (match) {
      matchArgs = parts.slice(parts.length - i, parts.length).join(' ');
      break;
    }
  }
  // If there's no command match, check if the
  // there's a `catch` command, which catches all
  // missed commands.
  if (!match) {
    match = find(cmds, '_catch');
    // If there is one, we still need to make sure we aren't
    // partially matching command groups, such as `do things` when
    // there is a command `do things well`. If we match partially,
    // we still want to show the help menu for that command group.
    if (match) {
      const allCommands = map(cmds, '_name');
      let wordMatch = false;
      for (const command of Object.values(allCommands)) {
        const parts2 = String(command).split(' ');
        const cmdParts = String(match.command).split(' ');
        let matchAll = true;
        for (let k = 0; k < cmdParts.length; ++k) {
          if (parts2[k] !== cmdParts[k]) {
            matchAll = false;
            break;
          }
        }
        if (matchAll) {
          wordMatch = true;
          break;
        }
      }
      if (wordMatch) {
        match = undefined;
      } else {
        matchArgs = cmd;
      }
    }
  }

  return {
    command: match,
    args: matchArgs
  };
}

/**
 * Prepares a command and all its parts for execution.
 */
function parseCommand(command: string, commands: Command[]) {
  let pipes: string[] = [];
  let match;
  let matchArgs;
  let matchParts: ReturnType<typeof matchCommand>;

  const parsePipes = () => {
    // First, split the command by pipes naively.
    // This will split command arguments in half when the argument contains a pipe character.
    // For example, say "(Vorpal|vorpal)" will be split into ['say "(Vorpal', 'vorpal)'] which isn't good.
    const naivePipes = String(command)
      .trim()
      .split('|');

    // Contruct empty array to place correctly split commands into.
    const newPipes: string[] = [];

    // We will look for pipe characters within these quotes to rejoin together.
    const quoteChars = ['"', "'", '`'] as const;

    // This will expand to contain one boolean key for each type of quote.
    // The value keyed by the quote is toggled off and on as quote type is opened and closed.
    // Example { "`": true, "'": false } would mean that there is an open angle quote.
    const quoteTracker: {
      [key in typeof quoteChars[number]]?: boolean;
    } = {};

    // The current command piece before being rejoined with it's over half.
    // Since it's not common for pipes to occur in commands, this is usually the entire command pipe.
    let commandPart = '';

    const isQuote = (char: string): char is typeof quoteChars[number] => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return quoteChars.includes(char as any);
    };

    // Loop through each naive pipe.
    forEach(range(0, naivePipes.length), key => {
      // It's possible/likely that this naive pipe is the whole pipe if it doesn't contain an unfinished quote.
      const possiblePipe = naivePipes[key];
      commandPart += possiblePipe;

      // Loop through each individual character in the possible pipe tracking the opening and closing of quotes.
      for (const char of possiblePipe) {
        if (isQuote(char)) {
          quoteTracker[char] = !quoteTracker[char];
        }
      }

      // Does the pipe end on an unfinished quote?
      const inQuote = some(quoteChars, quoteChar => quoteTracker[quoteChar]);

      // If the quotes have all been closed or this is the last possible pipe in the array, add as pipe.
      if (!inQuote || key * 1 === naivePipes.length - 1) {
        newPipes.push(commandPart.trim());
        commandPart = '';
      } else {
        // Quote was left open. The pipe character was previously removed when the array was split.
        commandPart += '|';
      }
    });

    // Set the first pipe to command and the rest to pipes.
    command = newPipes.shift() || '';
    pipes = pipes.concat(newPipes);
  };

  parsePipes();
  matchParts = matchCommand(command, commands);
  match = matchParts.command;
  matchArgs = matchParts.args;

  if (match && isFunction(match._parse)) {
    command = match._parse(command, matchParts.args);
    parsePipes();
    matchParts = matchCommand(command, commands);
    match = matchParts.command;
    matchArgs = matchParts.args;
  }

  return {
    command,
    match,
    matchArgs,
    pipes
  };
}

function buildCommandArgs(
  passedArgs: string,
  cmd: Command,
  execCommand?: QueuedCommand,
  isCommandArgKeyPairNormalized?: boolean
) {
  let args: CommandArgs = { options: {} };

  if (isCommandArgKeyPairNormalized) {
    // Normalize all foo="bar" with "foo='bar'"
    // This helps implement unix-like key value pairs.
    const reg = /(['"]?)(\w+)=(?:(['"])((?:(?!\3).)*)\3|(\S+))\1/g;
    passedArgs = passedArgs.replace(reg, `"$2='$4$5'"`);
  }

  // Types are custom arg types passed
  // into `minimist` as per its docs.
  const types = cmd._types || {};

  // Make a list of all boolean options
  // registered for this command. These are
  // simply commands that don't have required
  // or optional args.
  const booleans: string[] = [];
  cmd.options.forEach(opt => {
    if (!opt.required && !opt.optional) {
      if (opt.short) booleans.push(opt.short);
      if (opt.long) booleans.push(opt.long);
    }
  });

  // Review the args passed into the command,
  // and filter out the boolean list to only those
  // options passed in.
  // This returns a boolean list of all options
  // passed in by the caller, which don't have
  // required or optional args.
  const passedArgParts = passedArgs.split(' ');
  types.boolean = booleans
    .map(str => String(str).replace(/^-*/, ''))
    .filter(function(str) {
      let match = false;
      const strings = [`-${str}`, `--${str}`, `--no-${str}`];
      for (const passedArg of passedArgParts) {
        if (strings.includes(passedArg)) {
          match = true;
          break;
        }
      }
      return match;
    });

  // Use minimist to parse the args.
  const parsedArgs = parseArgs(passedArgs, types);

  function validateArg(arg: string, cmdArg: Arg) {
    return !(arg === undefined && cmdArg.required === true);
  }

  // Builds varidiac args and options.
  let valid = true;
  const remainingArgs = [...parsedArgs._];
  for (let l = 0; l < 10; ++l) {
    // !FIXME : why 10 limit?
    const matchArg = cmd._args[l];
    const passedArg = parsedArgs._[l];
    if (matchArg !== undefined) {
      valid = !valid ? false : validateArg(parsedArgs._[l], matchArg);
      if (!valid) {
        break;
      }
      if (passedArg !== undefined) {
        if (matchArg.variadic === true) {
          args[matchArg.name] = remainingArgs;
        } else {
          args[matchArg.name] = passedArg;
          remainingArgs.shift();
        }
      }
    }
  }

  if (!valid) {
    return '\n  Missing required argument. Showing Help:';
  }

  // Looks for ommitted required options and throws help.
  for (let m = 0; m < cmd.options.length; ++m) {
    const o = cmd.options[m];
    const short = String(o.short || '').replace(/-/g, '');
    const long = String(o.long || '')
      .replace(/--no-/g, '')
      .replace(/^-*/g, '');
    let exist = parsedArgs[short] !== undefined ? parsedArgs[short] : undefined;
    exist = exist === undefined && parsedArgs[long] !== undefined ? parsedArgs[long] : exist;
    const existsNotSet = exist === true || exist === false;
    if (existsNotSet && o.required !== 0) {
      return `\n  Missing required value for option ${o.long || o.short}. Showing Help:`;
    }
    if (exist !== undefined) {
      // Options is explicitly set on first line of function
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      args.options![long || short] = exist;
    }
  }

  // Looks for supplied options that don't
  // exist in the options list.
  // If the command allows unknown options,
  // adds it, otherwise throws help.
  const passedOpts = _.difference(Object.keys(parsedArgs), ['_', 'help']);
  for (const opt of passedOpts) {
    const optionFound = _.find(
      cmd.options,
      expected =>
        `--${opt}` === expected.long ||
        `--no-${opt}` === expected.long ||
        `-${opt}` === expected.short
    );
    if (optionFound === undefined) {
      if (!cmd._allowUnknownOptions) {
        return `\n  Invalid option: '${opt}'. Showing Help:`;
      }
      // Options is explicitly set on first line of function
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      args.options![opt] = parsedArgs[opt];
    }
  }

  // If args were passed into the programmatic
  // `vorpal.exec(cmd, args, callback)`, merge
  // them here.
  if (execCommand && execCommand.args && _.isObject(execCommand.args)) {
    args = _.extend(args, execCommand.args);
  }

  // Looks for a help arg and throws help if any.
  if (parsedArgs.help || parsedArgs._.indexOf('/?') > -1) {
    // Options is explicitly set on first line of function
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    args.options!.help = true;
  }

  return args;
}

/**
 * Makes an argument name pretty for help.
 */
function humanReadableArgName(arg: Arg): string {
  const nameOutput = arg.name + (arg.variadic === true ? '...' : '');
  return arg.required ? `<${nameOutput}>` : `[${nameOutput}]`;
}

/**
 * Pads a value with with space or
 * a specified delimiter to match a
 * given width.
 *
 * @param {String} str
 * @param {Number} width
 * @param {String} delimiter
 * @return {String}
 * @api private
 */
function pad(str: string | string[], width: number, delimiter = ' '): string {
  width = Math.floor(width);
  str = Array.isArray(str) ? str.join() : str;
  const len = Math.max(0, width - strip(str).length);
  return str + Array(len + 1).join(delimiter);
}

/**
 * Formats an array to display in a TTY
 * in a pretty fashion.
 */
function prettifyArray(arr: string[] = []): string {
  const arrClone = _.clone(arr);
  const width = process.stdout.columns;
  const longest =
    strip(
      arrClone.sort(function(a, b) {
        return strip(b).length - strip(a).length;
      })[0] || ''
    ).length + 2;
  const fullWidth = strip(String(arr.join(''))).length;
  const fitsOneLine = fullWidth + arr.length * 2 <= width;
  let cols = Math.floor(width / longest);
  cols = cols < 1 ? 1 : cols;
  if (fitsOneLine) {
    return arr.join('  ');
  }
  let col = 0;
  const lines = [];
  let line = '';
  for (const elem of arr) {
    if (col < cols) {
      col++;
    } else {
      lines.push(line);
      line = '';
      col = 1;
    }
    line += pad(elem, longest, ' ');
  }
  if (line !== '') {
    lines.push(line);
  }
  return lines.join('\n');
}

/**
 * Pad a row on the start and end with spaces.
 */
function padRow(str: string): string {
  return str
    .split('\n')
    .map(row => `  ${row}  `)
    .join('\n');
}

export default {
  parseArgs,
  parseCommand,
  matchCommand,
  buildCommandArgs,
  humanReadableArgName,
  prettifyArray,
  pad,
  padRow
};

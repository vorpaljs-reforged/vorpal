import {clone} from 'lodash';

import Command from '../command';
import {CommandInstance} from '../command-instance';
import Session from '../session';
import {isDefined} from './isDefined';
import {isObject} from './isObject';
import {parseArgs} from './parseArgs';

const PAIR_NORMALIZE_PATTERN = /(['"]?)(\w+)=(?:(['"])((?:(?!\3).)*)\3|(\S+))\1/g;
const MAX_ARGS = 10;

type CommandExecutionItem = {
  args: string | CommandArgs; // From buildCommandArgs()
  command: string; // The input on the command line
  commandObject?: Command;
  fn: (ci: CommandInstance, args: CommandArgs) => void; // TODO response value?
  options: ModeOptions;
  pipes: string[] | CommandInstance[]; // From parseCommand()
  session: Session;
  sync: boolean;
};

type ModeOptions = {
  message?: string;
  sessionId?: string;
};

type CommandArgs = {
  [arg: string]: string | string[];
} & CommandArgsOptions;

interface CommandArgsOptions {
  options: {
    [arg: string]: string | number | boolean;
  };
}

export function buildCommandArgs(
  passedArgs: string,
  command: Command,
  execCommand?: CommandExecutionItem,
  isCommandArgKeyPairNormalized = false
): CommandArgs | string {
  const args = {options: {}} as CommandArgs;

  // Normalize all foo="bar" with "foo='bar'".
  // This helps implement unix-like key value pairs.
  if (isCommandArgKeyPairNormalized) {
    passedArgs = passedArgs.replace(PAIR_NORMALIZE_PATTERN, `"$2='$4$5'"`);
  }

  // Types are custom arg types passed into `minimist` as per its docs.
  const types = command._types || {};

  // Make a list of all boolean options registered for this command.
  // These are simply commands that don't have required or optional args.
  const booleans = [];

  command.options.forEach(opt => {
    if (!opt.required && !opt.optional) {
      if (opt.short) {
        booleans.push(opt.short);
      }
      if (opt.long) {
        booleans.push(opt.long);
      }
    }
  });

  // Review the args passed into the command and filter out the boolean list to only those
  // options passed in. This returns a boolean list of all options passed in by the caller,
  // which don't have required or optional args.
  types.boolean = booleans
    .map(value => String(value).replace(/^-*/, ''))
    .filter(value => {
      const formats = [`-${value}`, `--${value}`, `--no-${value}`];

      return passedArgs.split(' ').some(part => formats.includes(part));
    });

  // Use minimist to parse the args, and then build varidiac args and options.
  const parsedArgs = parseArgs(passedArgs, types);
  const remainingArgs = clone(parsedArgs._);

  // Builds varidiac args and options.
  for (let l = 0; l < MAX_ARGS; l += 1) {
    const matchArg = command._args[l];
    const passedArg = parsedArgs._[l];

    if (matchArg) {
      // Can be a falsy value
      if (isDefined(passedArg)) {
        if (matchArg.variadic) {
          args[matchArg.name] = remainingArgs;
        } else {
          args[matchArg.name] = passedArg;
          remainingArgs.shift();
        }
      } else if (matchArg.required) {
        return '\n  Missing required argument. Showing Help:';
      }
    }
  }

  // Looks for omitted required options and throws help.
  for (const option of command.options) {
    const short = String(option.short || '').replace(/-/g, '');
    const long = String(option.long || '')
      .replace(/--no-/g, '')
      .replace(/^-*/g, '');
    const exists = isDefined(parsedArgs[long]) ? parsedArgs[long] : parsedArgs[short];
    const existsNotSet = exists === true || exists === false;

    if (existsNotSet && option.required !== 0) {
      return `\n  Missing required value for option ${option.long || option.short}. Showing Help:`;
    }
    if (isDefined(exists)) {
      args.options[long || short] = exists;
    }
  }

  // Looks for supplied options that don't exist in the options list.
  // If the command allows unknown options, adds it, otherwise throws help.
  const passedOpts = Object.keys(parsedArgs).filter(opt => opt !== '_' && opt !== 'help');

  for (const option of passedOpts) {
    const optionFound = command.options.find(
      expected =>
        `--${option}` === expected.long ||
        `--no-${option}` === expected.long ||
        `-${option}` === expected.short
    );
    if (!optionFound) {
      if (command._allowUnknownOptions) {
        args.options[option] = parsedArgs[option];
      } else {
        return `\n  Invalid option: '${option}'. Showing Help:`;
      }
    }
  }

  // If args were passed into the programmatic `Vorpal#exec`, merge them here.
  if (execCommand && execCommand.args && isObject(execCommand.args)) {
    Object.assign(args, execCommand.args);
  }

  // Looks for a help arg and throws help if any.
  if (parsedArgs.help || parsedArgs._.includes('/?')) {
    args.options.help = true;
  }

  return args;
}

import {
  camelCase,
  isBoolean,
  isUndefined,
  isArray,
  isEmpty,
  includes,
  isFunction,
  isNil
} from 'lodash';

import { EventEmitter } from 'events';
import Option from './option';
import { AutocompleteConfig } from './autocomplete';
import util from './util';
import Vorpal from './vorpal';
import { CommandInstance, CommandArgs } from 'command-instance';

export interface Arg {
  required: boolean;
  name: string;
  variadic: boolean;
}

export interface HasOptions {
  [option: string]: string;
}

export type ActionReturnValue = void;

export type ActionReturnType = ActionReturnValue | Promise<ActionReturnValue>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ActionCallback = (...args: any[]) => void;

export type ActionFn = {
  (this: CommandInstance, args: CommandArgs, cb?: ActionCallback): ActionReturnType;
};

export type ValidateFn = (args: CommandArgs) => boolean | string;

export type CancelFn = () => void;

export type DoneFn = () => void;

export type InitFn = ActionFn;

export type Types = { [key in 'string' | 'boolean']?: string[] };

export type HelpFn = {
  (
    this: Command | CommandInstance,
    args: CommandArgs | string,
    cb?: ActionCallback
  ): ActionReturnType;
};

export type ParseFn = Function;

export type AfterFn = Function;

export default class Command extends EventEmitter {
  public commands: Command[] = [];
  public options: Option[] = [];

  // TODO can this be removed (in favour of _parent)?
  public parent?: Vorpal;

  // TODO these were set to private but are accessed from outside this class
  public _noHelp?: boolean;
  public _mode = false;
  public _catch = false;
  public _name: string;
  public _aliases: string[] = [];
  public _parse?: ParseFn;
  public _cancel?: CancelFn;
  public _fn?: ActionFn;
  public _validate?: ValidateFn;
  public _init?: InitFn;
  public _delimiter?: string;
  public _types?: Types;
  public _args: Arg[] = [];
  public _allowUnknownOptions = false;
  public _help?: HelpFn;
  public _relay = false;
  public _hidden = false;
  public _parent: Vorpal;
  public _description?: string;
  public _after?: AfterFn;
  public _autocomplete?: AutocompleteConfig;
  public _done?: DoneFn;
  public _usage?: string;

  // Index signature used to store options.
  // Must be any to remain compatible with other class properties.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;

  /**
   * Initialize a new `Command` instance.
   */
  constructor(name: string, parent: Vorpal) {
    super();
    this._name = name;
    this._parent = parent;
  }

  /**
   * Registers an option for given command.
   */
  public option(
    flags: string,
    description: string,
    autocomplete?: AutocompleteConfig,
    defaultValue?: string | boolean
  ) {
    const option = new Option(flags, description, autocomplete);
    const optionName = option.name();
    const name = camelCase(optionName);

    // preassign default value only for --no-*, [optional], or <required>
    if (option.bool === false || option.optional || option.required) {
      // when --no-* we make sure default is true
      if (option.bool === false) {
        defaultValue = true;
      }
      // preassign only if we have a default
      if (defaultValue !== undefined) {
        this[name] = defaultValue;
      }
    }

    // register the option
    this.options.push(option);

    // when it's passed assign the value
    // and conditionally invoke the callback
    this.on(optionName, val => {
      // unassigned or bool
      if (isBoolean(this[name]) && isUndefined(this[name])) {
        // if no value, bool true, and we have a default, then use it!
        if (val === null) {
          this[name] = option.bool ? defaultValue || true : false;
        } else {
          this[name] = val;
        }
      } else if (val !== null) {
        // reassign
        this[name] = val;
      }
    });

    return this;
  }

  /**
   * Defines an action for a given command.
   */
  public action(fn: ActionFn) {
    this._fn = fn;
    return this;
  }

  /**
   * Let's you compose other funtions to extend the command.
   */
  public use(fn: (self: this) => this) {
    return fn(this);
  }

  /**
   * Defines a function to validate arguments
   * before action is performed. Arguments
   * are valid if no errors are thrown from
   * the function.
   */
  public validate(fn: ValidateFn) {
    this._validate = fn;
    return this;
  }

  /**
   * Defines a function to be called when the
   * command is canceled.
   */
  public cancel(fn: CancelFn) {
    this._cancel = fn;
    return this;
  }

  /**
   * Defines a method to be called when
   * the command set has completed.
   */
  public done(fn: DoneFn) {
    this._done = fn;
    return this;
  }

  /**
   * Defines tabbed auto-completion
   * for the given command. Favored over
   * deprecated command.autocompletion.
   */
  public autocomplete(conf: AutocompleteConfig) {
    this._autocomplete = conf;
    return this;
  }

  /**
   * Defines an init action for a mode command.
   */
  public init(fn: InitFn) {
    if (this._mode !== true) {
      throw Error('Cannot call init from a non-mode action.');
    }
    this._init = fn;
    return this;
  }

  /**
   * Defines a prompt delimiter for a
   * mode once entered.
   */
  public delimiter(delimiter: string) {
    this._delimiter = delimiter;
    return this;
  }

  /**
   * Sets args for static typing of options
   * using minimist.
   */
  public types(types: Types) {
    function isValid(item: string): item is 'string' | 'boolean' {
      return ['string', 'boolean'].includes(item);
    }
    Object.keys(types).forEach(key => {
      if (!isValid(key)) {
        throw new Error('An invalid type was passed into command.types(): ' + key);
      }
      types[key] = (Array.isArray(types[key]) ? types[key] : [types[key]]) as string[];
    });
    this._types = types;
    return this;
  }

  /**
   * Defines an alias for a given command.
   */
  public alias(...aliases: string[]) {
    for (const alias of aliases) {
      if (isArray(alias)) {
        for (const subalias of alias) {
          this.alias(subalias);
        }
        return this;
      }
      this._parent.commands.forEach(cmd => {
        if (!isEmpty(cmd._aliases)) {
          if (includes(cmd._aliases, alias)) {
            const msg =
              'Duplicate alias "' +
              alias +
              '" for command "' +
              this._name +
              '" detected. Was first reserved by command "' +
              cmd._name +
              '".';
            throw new Error(msg);
          }
        }
      });
      this._aliases.push(alias);
    }
    return this;
  }

  /**
   * Defines description for given command.
   */
  public description<T>(str?: T): T extends string ? this : string {
    if (typeof str === 'string') {
      this._description = str;
      // Type cast as any here to use function return type
      // https://github.com/microsoft/TypeScript/issues/24929
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return this as any;
    }
    // Type cast as any here to use function return type
    // https://github.com/microsoft/TypeScript/issues/24929
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this._description as any;
  }

  /**
   * Removes self from Vorpal instance.
   */
  public remove() {
    this._parent.commands = this._parent.commands.filter(command => {
      return command._name !== this._name;
    });
    return this;
  }

  /**
   * Returns the commands arguments as string.
   * TODO this actually returns void
   */
  public arguments(description: string) {
    return this._parseExpectedArgs(description.split(/ +/));
  }

  /**
   * Returns the help info for given command.
   */
  public helpInformation() {
    let description: string[] = [];
    const cmdName = this._name;
    let alias = '';

    if (this._description) {
      description = [`  ${this._description}`, ''];
    }

    if (this._aliases.length > 0) {
      alias = `  Alias: ${this._aliases.join(' | ')}\n`;
    }
    const usage = ['', `  Usage:  ${cmdName} ${this.usage()}`, ''];

    // TODO why is this here?
    const cmds: never[] = [];

    const help = String(this.optionHelp().replace(/^/gm, '    '));
    const options = ['  Options:', '', help, ''];

    return usage
      .concat(cmds)
      .concat(alias)
      .concat(description)
      .concat(options)
      .join('\n')
      .replace(/\n\n\n/g, '\n\n');
  }

  /**
   * Doesn't show command in the help menu.
   */
  public hidden() {
    this._hidden = true;
    return this;
  }

  /**
   * Allows undeclared options to be passed in with the command.
   */
  public allowUnknownOptions(allowUnknownOptions = true) {
    this._allowUnknownOptions = !!allowUnknownOptions;
    return this;
  }

  /**
   * Returns the command usage string for help.
   */
  public usage(str?: string) {
    const args = this._args.map(arg => util.humanReadableArgName(arg));

    const usage =
      '[options]' +
      (this.commands.length ? ' [command]' : '') +
      (this._args.length ? ` ${args.join(' ')}` : '');

    if (isNil(str)) {
      return this._usage || usage;
    }

    this._usage = str;

    return this;
  }

  /**
   * Returns the help string for the command's options.
   */
  public optionHelp() {
    const width = this._largestOptionLength();

    // Prepend the help information
    return [util.pad('--help', width) + '  output usage information']
      .concat(this.options.map(option => `${util.pad(option.flags, width)}  ${option.description}`))
      .join('\n');
  }

  /**
   * Returns the length of the longest option.
   */

  private _largestOptionLength() {
    return this.options.reduce((max, option) => Math.max(max, option.flags.length), 0);
  }

  /**
   * Adds a custom handling for the --help flag.
   */
  public help(fn: HelpFn) {
    if (isFunction(fn)) {
      this._help = fn;
    }
    return this;
  }

  /**
   * Edits the raw command string before it
   * is executed.
   */
  public parse(fn: ParseFn) {
    if (isFunction(fn)) {
      this._parse = fn;
    }
    return this;
  }

  /**
   * Adds a command to be executed after command completion.
   */
  public after(fn: AfterFn) {
    if (isFunction(fn)) {
      this._after = fn;
    }
    return this;
  }

  /**
   * Parses and sets expected command arguments.
   */
  public _parseExpectedArgs(args: string[]) {
    if (!args.length) {
      return;
    }
    args.forEach(arg => {
      const argDetails = {
        required: false,
        name: '',
        variadic: false
      };

      if (arg.startsWith('<')) {
        argDetails.required = true;
        argDetails.name = arg.slice(1, -1);
      } else if (arg.startsWith('[')) {
        argDetails.name = arg.slice(1, -1);
      }

      if (argDetails.name.length > 3 && argDetails.name.slice(-3) === '...') {
        argDetails.variadic = true;
        argDetails.name = argDetails.name.slice(0, -3);
      }
      if (argDetails.name) {
        this._args.push(argDetails);
      }
    });

    // If the user entered args in a weird order,
    // properly sequence them.
    if (this._args.length > 1) {
      this._args = this._args.sort(function (argu1, argu2) {
        if (argu1.required && !argu2.required) {
          return -1;
        } else if (argu2.required && !argu1.required) {
          return 1;
        } else if (argu1.variadic && !argu2.variadic) {
          return 1;
        } else if (argu2.variadic && !argu1.variadic) {
          return -1;
        }
        return 0;
      });
    }

    return;
  }
}

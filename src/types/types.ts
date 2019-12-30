import {EventEmitter} from 'events';
import {Arg} from '../command';
import History from '../history';
import Option from '../option';
import {IAutocompleteConfig} from './autocomplete';

export interface IVorpal extends EventEmitter {
  parent: IVorpal;
  commands: ICommand[];
  cmdHistory: History;
  command(name, desc?, opts?): ICommand;
  log(...args);
  ui: any;
  util: any;
  session: any;
  prompt(options, cb);
  _commandHelp(command);
  _send(...argz); // TODO interface to change
}

export type ArgTypes = {
  [P in 'string' | 'boolean']: unknown;
};

type ParseFn = (str: string, args: string | CommandArgs) => string;
type ValidateFn = (instance: IcommandInstance, args: CommandArgs) => string;
type CancelFn = (instance: IcommandInstance) => void;
type FnFn = (args: Arg[], onComplete: (err?: Error) => void) => void;

export interface ICommand extends EventEmitter {
  commands: ICommand[];
  options: Option[];
  parent: IVorpal;
  _name: string;
  _types: ArgTypes;
  _parse: ParseFn;
  _validate: ValidateFn;
  _cancel: CancelFn;
  _fn: FnFn;
  _init: () => void;
  _mode: boolean;
  _args: Arg[];
  _catch: Function;
  _hidden: boolean;
  _help: Function;
  _aliases: string[];
  _allowUnknownOptions: boolean;
  _autocomplete: IAutocompleteConfig;
  _delimiter: string;
  option(flags, description, autocomplete?): ICommand;
  action(fn): ICommand;
  use(fn): ICommand;
  validate(fn): ICommand;

  cancel(fn: CancelFn): ICommand;
  done(fn);
  autocomplete(obj: IAutocompleteConfig);
  init(fn): ICommand;
  delimiter(delimiter);
  types(types);
  alias(...aliases): ICommand;
  description(str): ICommand;
  remove();
  arguments(desc);
  helpInformation();
  hidden();
  allowUnknownOptions(allowUnknownOptions);
  usage(str?): ICommand;
  optionHelp();
  help(fn);
  parse: (fn: ParseFn) => ICommand;
  after(fn): ICommand;
}

export interface IcommandInstance {
  commandWrapper?: any;
  args?: CommandArgs;
  commandObject?: ICommand;
  command?: any;
  callback?: any;
  downstream?: IcommandInstance;
}

// The entire command, with arguments and options, entered in the command line
export type InputCommand = string;

export interface IMatchParts<T extends CommandArgs | string> {
  args: T;
  command?: ICommand;
}

export type CommandArgs = {
  [arg: string]: string | string[];
} & CommandArgsOptions;

interface CommandArgsOptions {
  options: {
    [arg: string]: string | number | boolean;
  };
}

export type IParsedCommand = {
  command: InputCommand;
  match?: ICommand;
  matchArgs: string | CommandArgs;
  pipes: string[];
};

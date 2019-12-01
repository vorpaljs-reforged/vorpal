import { EventEmitter } from 'events';
import os from 'os';

import chalk from 'chalk';
import _, { isFunction, isString, isObject } from 'lodash';
import minimist from 'minimist';
import wrap from 'wrap-ansi';
import TypedEmitter from 'typed-emitter';
import { QuestionCollection } from 'inquirer';

import Command, { ActionFn, CancelFn, ValidateFn, InitFn, Args, ActionReturnType } from './command';
import { CommandInstance } from './command-instance';
import History from './history';
import intercept, { InterceptFn } from './intercept';
import LocalStorage from './local-storage';
import Session from './session';
import ui, { KeyPressData, PipeFn, SigIntFn } from './ui';
import Util, { CommandMatch } from './util';
import commons from './vorpal-commons';

interface PromptOption {
  sessionId?: string;
  message?: string;
}

interface SessionData {
  sessionId?: string;
}

// interface DataSession {
//   sessionId?: string;
//   command?: string;
//   args?: any;
//   options?: PromptOption;
//   value?: any;
//   key?: string;
//   completed?: boolean;
// }

type UseCommandShape = {
  command?: string;
  description?: string;
  action?: ActionFn;
  options: [string, string] | [string, string][];
};

interface CommandOptions {
  mode?: boolean;
  catch?: boolean;
  noHelp?: boolean;
}

type PromptEventData = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value: any;
  options: QuestionCollection;
} & PromptOption;

type CommandEventData = {
  command: string;
  args: string | Args;
  completed: boolean;
  sessionId: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ExecCallback = (err?: Error | string | any, data?: any) => void;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type InternalExecCallback<E = any, D = string | ActionReturnType> = (
  cmd: QueuedCommand,
  err?: E,
  msg?: D,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  argus?: any
) => E | D | void;

type ExecSyncOptions = {
  fatal?: boolean;
};

export type QueuedCommand = {
  command: string;
  commandInstance?: CommandInstance;
  args: string | Args;
  options?: ExecSyncOptions & SessionData;
  callback?: ExecCallback;
  session: Session;
  sync?: boolean;
  pipes?: (string | CommandMatch)[];
  fn?: ActionFn;
  _cancel?: CancelFn;
  validate?: ValidateFn;
  commandObject?: Command;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  resolve?: (data?: any) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  reject?: (error?: Error | string | any) => void;
};

export type HelpFn = (command: string) => string;

interface Events {
  command_registered: (data: { command: Command; name: string }) => void;
  keypress: (data: KeyPressData) => void;
  client_prompt_submit: (data: string) => void;
  mode_exit: (data: string) => void;
  vorpal_exit: () => void;
  'vantage-prompt-upstream': (data: PromptEventData) => void;
  'vantage-prompt-downstream': (data: PromptEventData) => void;
  'vantage-keypress-upstream': (data: KeyPressData) => void;
  'vantage-keypress-downstream': (data: KeyPressData) => void;
  'vantage-resume-downstream': (data: SessionData) => void;
  'vantage-close-downstream': (data: SessionData) => void;
  'vantage-command-upstream': (data: CommandEventData) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  'vantage-ssn-stdout-downstream': (data: SessionData & { value: any }) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  'vantage-delimiter-downstream': (data: SessionData & { value: any }) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  'vantage-mode-delimiter-downstream': (data: SessionData & { value: any }) => void;
  client_command_cancelled: (data: { command: string }) => void;
  client_command_error: (data: { command: string; error: Error }) => void;
  client_command_executed: (data: { command: string }) => void;
}

type TypedEventEmitter = { new (): TypedEmitter<Events> };

function argsIsFn(args?: Args | ExecCallback): args is ExecCallback {
  return typeof args === 'function';
}

export default class Vorpal extends (EventEmitter as TypedEventEmitter) {
  // @todo: do we really need these references?
  public chalk: typeof chalk;
  public lodash: typeof _;
  public ui: typeof ui;
  public util: typeof Util;
  public Session: typeof Session;

  public parent?: Vorpal;
  private _version: string;
  private _title: string;
  private _description: string;
  private _banner: string;
  public cmdHistory: History;
  public commands: Command[];
  private _queue: QueuedCommand[];
  private _command?: QueuedCommand;
  private _delimiter: string;
  private server: { sessions: Session[] };
  private _hooked: boolean;
  public session: Session;
  private isCommandArgKeyPairNormalized: boolean;
  private executables?: boolean;
  public _help?: HelpFn;
  public _fatal?: boolean;

  constructor() {
    // eslint-disable-next-line constructor-super
    super();

    // Program version, exposed through vorpal.version(str);
    this._version = '';

    // Program title
    this._title = '';

    // Program description
    this._description = '';

    // Program baner
    this._banner = '';

    // Command line history instance
    this.cmdHistory = new History(); // this.CmdHistoryExtension();

    // Registered `vorpal.command` commands and
    // their options.
    this.commands = [];

    // Queue of IP requests, executed async, in sync.
    this._queue = [];

    // Current command being executed.
    this._command = undefined;

    // Expose UI.
    this.ui = ui;

    // Expose chalk as a convenience.
    this.chalk = chalk;

    // Expose lodash as a convenience.
    this.lodash = _;

    // Exposed through vorpal.delimiter(str).
    this._delimiter = 'local@' + String(os.hostname()).split('.')[0] + '~$ ';
    ui.setDelimiter(this._delimiter);

    // Placeholder for vantage server. If vantage
    // is used, this will be over-written.
    this.server = {
      sessions: []
    };

    // Whether all stdout is being hooked through a function.
    this._hooked = false;

    // Expose common utilities, like padding.
    this.util = Util;

    this.Session = Session;

    // Active vorpal server session.
    this.session = new Session({
      local: true,
      user: 'local',
      parent: this,
      delimiter: this._delimiter
    });

    // Allow unix-like key value pair normalization to be turned off by toggling this switch on.
    this.isCommandArgKeyPairNormalized = true;

    this._init();
  }

  /**
   * Extension to `constructor`.
   */
  public _init() {
    ui.on('vorpal_ui_keypress', data => {
      this.emit('keypress', data);
      this._onKeypress(data.key, data.value);
    });

    this.use(commons);
  }

  /**
   * Parses `process.argv` and executes
   * a Vorpal command based on it.
   */
  public parse<T>(
    argv: string[],
    options: { use?: T | 'minimist' } = {}
  ): T extends string ? minimist.ParsedArgs : Vorpal {
    const args = argv;
    const catchExists = this.commands.find(command => command._catch) !== undefined;
    args.shift();
    args.shift();
    if (args.length > 0 || catchExists) {
      if (options.use === 'minimist') {
        // Type cast as any here to use function return type
        // https://github.com/microsoft/TypeScript/issues/24929
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return minimist(args) as any;
      }

      // Wrap the spaced args back in quotes.
      for (let i = 0; i < args.length; ++i) {
        if (i === 0) {
          continue;
        }
        if (args[i].indexOf(' ') > -1) {
          args[i] = `"${args[i]}"`;
        }
      }
      this.exec(args.join(' '), function(err?: string) {
        if (err !== undefined && err !== null) {
          throw new Error(err);
        }
        process.exit(0);
      });
    }

    // Type cast as any here to use function return type
    // https://github.com/microsoft/TypeScript/issues/24929
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this as any;
  }

  /**
   * Sets version of your application's API.
   */
  public version(version: string) {
    this._version = version;
    return this;
  }

  /**
   * Sets the title of your application.
   */
  public title(title: string) {
    this._title = title;
    return this;
  }

  /**
   * Sets the description of your application.
   */
  public description(description: string) {
    this._description = description;
    return this;
  }

  /**
   * Sets the banner of your application.
   */
  public banner(banner: string) {
    this._banner = banner;
    return this;
  }

  /**
   * Sets the permanent delimiter for this
   * Vorpal server instance.
   */
  public delimiter(str: string) {
    this._delimiter = str;
    if (this.session.isLocal() && !this.session.client) {
      this.session.delimiter(str);
    }
    return this;
  }

  /**
   * Imports a library of Vorpal API commands
   * from another Node module as an extension
   * of Vorpal.
   */
  public use(
    commands?:
      | string
      | ((vorpal: Vorpal, options?: {}) => void)
      | UseCommandShape
      | UseCommandShape[],
    options?: {}
  ) {
    if (!commands) {
      return this;
    }
    if (isFunction(commands)) {
      commands.call(this, this, options);
    } else if (isString(commands)) {
      /* eslint-disable-next-line @typescript-eslint/no-var-requires */
      this.use(require(commands), options);
    } else {
      commands = Array.isArray(commands) ? commands : [commands];
      for (const cmd of commands) {
        if (cmd.command) {
          const command = this.command(cmd.command);
          if (cmd.description) {
            command.description(cmd.description);
          }
          if (cmd.options) {
            cmd.options = Array.isArray(cmd.options) ? cmd.options : [cmd.options];
            for (let j = 0; j < cmd.options.length; ++j) {
              command.option(cmd.options[j][0], cmd.options[j][1]);
            }
          }
          if (cmd.action) {
            command.action(cmd.action);
          }
        }
      }
    }
    return this;
  }

  /**
   * Registers a new command in the vorpal API.
   */
  public command(name: string, desc?: string, opts: CommandOptions = {}) {
    name = String(name);

    const args = name.match(/(\[[^\]]*\]|<[^>]*>)/g) || [];

    const cmdNameRegExp = /^([^[<]*)/;
    const cmdNameMatches = cmdNameRegExp.exec(name);

    if (cmdNameMatches === null || cmdNameMatches.length === 0) {
      throw new Error('Could not find a command name');
    }

    const cmdName = cmdNameMatches[0].trim();

    const cmd = new Command(cmdName, this);

    if (desc) {
      cmd.description(desc);
      this.executables = true;
    }

    cmd._noHelp = Boolean(opts.noHelp);
    cmd._mode = opts.mode || false;
    cmd._catch = opts.catch || false;
    cmd._parseExpectedArgs(args);
    cmd.parent = this;

    let exists = false;
    for (let i = 0; i < this.commands.length; ++i) {
      exists = this.commands[i]._name === cmd._name ? true : exists;
      if (exists) {
        this.commands[i] = cmd;
        break;
      }
    }
    if (!exists) {
      this.commands.push(cmd);
    } else {
      /* // DISABLED While fixing tests
      console.warn(
        chalk.yellow(
          'Warning: command named "' +
            name +
            '" was registered more than once.\nIf you intend to override a command, you should explicitly remove the first command with command.remove().'
        )
      );*/
    }

    this.emit('command_registered', { command: cmd, name });

    return cmd;
  }

  /**
   * Registers a new 'mode' command in the vorpal API.
   */
  public mode(name: string, desc?: string, opts: CommandOptions = {}) {
    return this.command(name, desc, { ...opts, mode: true });
  }

  /**
   * Registers a 'catch' command in the vorpal API.
   * This is executed when no command matches are found.
   */
  public catch(name: string, desc?: string, opts: CommandOptions = {}) {
    return this.command(name, desc, { ...opts, catch: true });
  }

  /**
   * An alias to the `catch` command.
   */
  public default(name: string, desc?: string, opts: CommandOptions = {}) {
    return this.catch(name, desc, opts);
  }

  /**
   * Delegates to ui.log.
   */
  public log(...args: string[]) {
    this.ui.log(...args);
    return this;
  }

  /**
   * Intercepts all logging through `vorpal.log`
   * and runs it through the function declared by
   * `vorpal.pipe()`.
   */
  public pipe(fn: PipeFn) {
    if (this.ui) {
      this.ui._pipeFn = fn;
    }
    return this;
  }

  /**
   * If Vorpal is the local terminal,
   * hook all stdout, through a fn.
   */
  public hook(fn: InterceptFn) {
    if (fn !== undefined) {
      this._hook(fn);
    } else {
      this._unhook();
    }
    return this;
  }

  /**
   * Unhooks stdout capture.
   * @todo: this looks very strange. If _hooked is truthy, this just calls itself recursively?
   */
  public _unhook() {
    if (this._hooked && this._unhook !== undefined) {
      this._unhook();
      this._hooked = false;
    }
    // return this; // TODO check
  }

  /**
   * Hooks all stdout through a given function.
   */
  public _hook(fn: InterceptFn) {
    if (this._hooked && this._unhook !== undefined) {
      this._unhook();
    }
    this._unhook = intercept(fn);
    this._hooked = true;
    return this;
  }

  /**
   * Set id for command line history
   */
  public history(id: string) {
    this.cmdHistory.setId(id);
    return this;
  }

  /**
   * Set id for local storage
   */
  public localStorage(id: string) {
    if (id === undefined) {
      throw new Error('vorpal.localStorage() requires a unique key to be passed in.');
    }
    const ls = new LocalStorage(id);
    ['getItem', 'setItem', 'removeItem'].forEach(method => {
      // @todo: setting properties on a class method here. Why?
      // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
      // @ts-ignore
      this.localStorage[method] = ls[method].bind(ls);
    });
    return this;
  }

  /**
   * Set the path to where command line history is persisted.
   * Must be called before vorpal.history
   */
  public historyStoragePath(path: string) {
    this.cmdHistory.setStoragePath(path);
    return this;
  }

  /**
   * Hook the tty prompt to this given instance
   * of vorpal.
   */
  public show() {
    ui.attach(this);
    return this;
  }

  /**
   * Disables the vorpal prompt on the
   * local terminal.
   *
   * @return {Vorpal}
   * @api public
   */

  public hide() {
    ui.detach(this);
    return this;
  }

  /**
   * Listener for a UI keypress. Either
   * handles the keypress locally or sends
   * it upstream.
   */
  public _onKeypress(key: string, value?: string) {
    if (this.session.isLocal() && !this.session.client && !this._command) {
      this.session.getKeypressResult(key, value, (err, result) => {
        if (!err && result !== undefined) {
          if (Array.isArray(result)) {
            const formatted = Util.prettifyArray(result);
            this.ui.imprint();
            this.session.log(formatted);
          } else {
            this.ui.input(result);
          }
        }
      });
    } else {
      this._send('vantage-keypress-upstream', 'upstream', {
        key,
        value,
        sessionId: this.session.id
      });
    }
  }

  /**
   * For use in vorpal API commands, sends
   * a prompt command downstream to the local
   * terminal. Executes a prompt and returns
   * the response upstream to the API command.
   */
  public prompt<T>(
    options: QuestionCollection<T> & PromptOption,
    userCallback: (result: T) => void
  ) {
    return new Promise(resolve => {
      // Setup callback to also resolve promise.
      const cb = (response: T) => {
        // Does not currently handle Inquirer validation errors.
        resolve(response);
        if (userCallback) {
          userCallback(response);
        }
      };

      let prompt;
      const ssn = this.getSessionById(options.sessionId);

      if (!ssn) {
        throw new Error('Vorpal.prompt was called without a passed Session ID.');
      }

      const handler = (data: PromptEventData) => {
        const response = data.value;
        this.removeListener('vantage-prompt-upstream', handler);
        cb(response);
      };

      if (ssn.isLocal()) {
        ui.setDelimiter(options.message || ssn.delimiter());
        prompt = ui.prompt<T>(options, result => {
          ui.setDelimiter(ssn.delimiter());
          cb(result);
        });
      } else {
        this.on('vantage-prompt-upstream', handler);
        this._send('vantage-prompt-downstream', 'downstream', {
          options,
          value: undefined,
          sessionId: ssn.id
        });
      }
      return prompt;
    });
  }

  /**
   * Renders the CLI prompt or sends the
   * request to do so downstream.
   */
  public _prompt(data: SessionData = {}) {
    if (!data.sessionId) {
      data.sessionId = this.session.id;
    }
    const ssn = this.getSessionById(data.sessionId);

    // If we somehow got to _prompt and aren't the
    // local client, send the command downstream.
    if (!ssn.isLocal()) {
      this._send('vantage-resume-downstream', 'downstream', { sessionId: data.sessionId });
      return this;
    }

    if (ui.midPrompt()) {
      return this;
    }

    const prompt = ui.prompt(
      {
        type: 'input',
        name: 'command',
        message: ssn.fullDelimiter()
      },
      result => {
        if (this.ui._cancelled === true) {
          this.ui._cancelled = false;
          return;
        }
        const str = String(result.command).trim();
        this.emit('client_prompt_submit', str);
        if (str === '' || str === 'undefined') {
          this._prompt(data);
          return;
        }
        this.exec(str, () => {
          this._prompt(data);
        });
      }
    );

    return prompt;
  }

  /**
   * Executes a vorpal API command and
   * returns the response either through a
   * callback or Promise in the absence
   * of a callback.
   *
   * A little black magic here - because
   * we sometimes have to send commands 10
   * miles upstream through 80 other instances
   * of vorpal and we aren't going to send
   * the callback / promise with us on that
   * trip, we store the command, callback,
   * resolve and reject objects (as they apply)
   * in a local vorpal._command variable.
   *
   * When the command eventually comes back
   * downstream, we dig up the callbacks and
   * finally resolve or reject the promise, etc.
   *
   * Lastly, to add some more complexity, we throw
   * command and callbacks into a queue that will
   * be unearthed and sent in due time.
   */
  public exec(cmd: string, args?: Args | ExecCallback, cb?: ExecCallback) {
    if (argsIsFn(args)) {
      cb = args;
      args = {};
    } else {
      args = args || {};
    }

    const ssn = args.sessionId ? this.getSessionById(String(args.sessionId)) : this.session;

    const command: QueuedCommand = {
      command: cmd,
      args,
      callback: cb,
      session: ssn,
      resolve: undefined,
      reject: undefined
    };

    if (cb !== undefined) {
      this._queue.push(command);
      this._queueHandler();
      return this;
    }

    return new Promise((resolve, reject) => {
      command.resolve = resolve;
      command.reject = reject;
      this._queue.push(command);
      this._queueHandler();
    });
  }

  /**
   * Executes a Vorpal command in sync.
   */
  public execSync(cmd: string, options?: Args & ExecSyncOptions & SessionData) {
    let ssn = this.session;
    options = options || {};
    if (options.sessionId) {
      ssn = this.getSessionById(options.sessionId);
    }

    const command: QueuedCommand = {
      command: cmd,
      args: options,
      session: ssn,
      sync: true,
      options
    };

    return this._execQueueItem(command);
  }

  /**
   * Commands issued to Vorpal server
   * are executed in sequence. Called once
   * when a command is inserted or completes,
   * shifts the next command in the queue
   * and sends it to `vorpal._execQueueItem`.
   */
  public _queueHandler() {
    if (this._queue.length > 0 && this._command === undefined) {
      const item = this._queue.shift() as QueuedCommand;
      this._execQueueItem(item);
    }
  }

  /**
   * Fires off execution of a command - either
   * calling upstream or executing locally.
   */
  public _execQueueItem(cmd: QueuedCommand) {
    this._command = cmd;
    if (cmd.session.isLocal() && !cmd.session.client) {
      return this._exec(cmd);
    }
    this._send('vantage-command-upstream', 'upstream', {
      command: cmd.command,
      args: cmd.args,
      completed: false,
      sessionId: cmd.session.id
    });
  }

  /**
   * Executes a vorpal API command.
   * Warning: Dragons lie beyond this point.
   */
  public _exec(item: QueuedCommand) {
    item = item || {};
    item.command = item.command || '';
    const modeCommand = item.command;
    item.command = item.session._mode ? String(item.session._mode) : item.command;

    let promptCancelled = false;
    if (this.ui._midPrompt) {
      promptCancelled = true;
      this.ui.cancel();
    }

    if (!item.session) {
      throw new Error('Fatal Error: No session was passed into command for execution: ' + item);
    }

    if (typeof item.command === 'undefined') {
      throw new Error('vorpal._exec was called with an undefined command.');
    }

    // History for our 'up' and 'down' arrows.
    item.session.history(item.session._mode ? modeCommand : item.command);

    const commandData = this.util.parseCommand(item.command, this.commands);
    item.command = commandData.command;
    item.pipes = commandData.pipes;
    const match = commandData.match;
    const matchArgs = commandData.matchArgs;

    function throwHelp(cmd: QueuedCommand, msg?: string, alternativeMatch?: Command) {
      if (msg) {
        cmd.session.log(msg);
      }
      const pickedMatch = alternativeMatch || match;
      pickedMatch && cmd.session.log(pickedMatch.helpInformation());
    }

    const callback: InternalExecCallback = (cmd, err, msg, argus) => {
      // Resume the prompt if we had to cancel
      // an active prompt, due to programmatic
      // execution.
      if (promptCancelled) {
        this._prompt();
      }
      if (cmd.sync) {
        // If we want the command to be fatal,
        // throw a real error. Otherwise, silently
        // return the error.
        delete this._command;
        if (err) {
          if (cmd.options && (cmd.options.fatal === true || this._fatal === true)) {
            throw new Error(err);
          }
          return err;
        }
        return msg;
      } else if (cmd.callback) {
        if (argus) {
          cmd.callback.apply(this, argus);
        } else {
          cmd.callback.call(this, err, msg);
        }
      } else if (!err && cmd.resolve) {
        cmd.resolve(msg);
      } else if (err && cmd.reject) {
        cmd.reject(msg);
      }
      delete this._command;
      this._queueHandler();
    };

    if (match) {
      item.fn = match._fn;
      item._cancel = match._cancel;
      item.validate = match._validate;
      item.commandObject = match;
      const defaultInit: InitFn = (arrgs, cb) => {
        cb && cb();
      };
      const init = match._init || defaultInit;
      const delimiter = match._delimiter || String(item.command) + ':';

      item.args = this.util.buildCommandArgs(
        String(matchArgs),
        match,
        item,
        this.isCommandArgKeyPairNormalized
      );

      // If we get a string back, it's a validation error.
      // Show help and return.
      if (isString(item.args) || !isObject(item.args)) {
        throwHelp(item, item.args);
        return callback(item, undefined, item.args);
      }

      // Build the piped commands.
      let allValid = true;
      for (let j = 0; j < item.pipes.length; ++j) {
        const commandParts = this.util.matchCommand(String(item.pipes[j]), this.commands);
        if (!commandParts.command) {
          item.session.log(this._commandHelp(String(item.pipes[j])));
          allValid = false;
          break;
        }
        commandParts.args = this.util.buildCommandArgs(
          String(commandParts.args),
          commandParts.command
        );
        if (isString(commandParts.args) || !isObject(commandParts.args)) {
          throwHelp(item, commandParts.args, commandParts.command);
          allValid = false;
          break;
        }
        // TODO refactor re-assignment of types here
        item.pipes[j] = commandParts;
      }
      // If invalid piped commands, return.
      if (!allValid) {
        return callback(item);
      }

      // If `--help` or `/?` is passed, do help.
      // TODO remove non-null assertion or change Args type
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      if (item.args.options!.help && isFunction(match._help)) {
        // If the command has a custom help function, run it
        // as the actual "command". In this way it can go through
        // the whole cycle and expect a callback.
        item.fn = match._help;
        delete item.validate;
        delete item._cancel;
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      } else if (item.args.options!.help) {
        // Otherwise, throw the standard help.
        throwHelp(item, '');
        return callback(item);
      }

      // If this command throws us into a 'mode',
      // prepare for it.
      if (match._mode === true && !item.session._mode) {
        // Assign vorpal to be in a 'mode'.
        item.session._mode = item.command;
        // Execute the mode's `init` function
        // instead of the `action` function.
        item.fn = init;
        delete item.validate;

        this.cmdHistory.enterMode();
        item.session.modeDelimiter(delimiter);
      } else if (item.session._mode) {
        if (String(modeCommand).trim() === 'exit') {
          this._exitMode({ sessionId: item.session.id });
          return callback(item);
        }
        // This executes when actually in a 'mode'
        // session. We now pass in the raw text of what
        // is typed into the first param of `action`
        // instead of arguments.
        item.args = modeCommand;
      }

      if (item.sync === true) {
        // If we're running synchronous commands,
        // we don't support piping.
        let response;
        let error;
        try {
          response =
            item.fn &&
            item.fn.call(
              new CommandInstance({
                downstream: undefined,
                commandWrapper: item,
                commandObject: item.commandObject,
                args: item.args
              }),
              typeof item.args === 'string' ? {} : item.args
            );
        } catch (e) {
          error = e;
        }
        return callback(item, error, response);
      }

      // Builds commandInstance objects for every
      // command and piped command included in the
      // execution string.

      // Build the instances for each pipe.
      item.pipes = item.pipes.map(function(pipe) {
        if (typeof pipe === 'string') {
          throw new Error('pipe should be object by now');
        }
        if (!pipe.command) {
          throw new Error('pipe.command not set');
        }
        return new CommandInstance({
          commandWrapper: item,
          command: pipe.command._name,
          commandObject: pipe.command,
          args: pipe.args
        });
      });

      // Reverse through the pipes and assign the
      // `downstream` object of each parent to its
      // child command.
      for (let k = item.pipes.length - 1; k > -1; --k) {
        const pipe = item.pipes[k];
        const downstream = item.pipes[k + 1];
        if (typeof pipe === 'string' || typeof downstream === 'string') {
          throw new Error('pipe should be object by now');
        }
        pipe.downstream = downstream;
      }

      item.session.execCommandSet(item, function(wrapper, err, data, argus) {
        callback(wrapper, err, data, argus);
      });
    } else {
      // If no command match, just return.
      item.session.log(this._commandHelp(item.command));
      return callback(item, undefined, 'Invalid command.');
    }
  }

  /**
   * Exits out of a give 'mode' one is in.
   * Reverts history and delimiter back to
   * regular vorpal usage.
   */
  public _exitMode(options: SessionData) {
    const ssn = this.getSessionById(options.sessionId);
    ssn._mode = false;
    this.cmdHistory.exitMode();
    ssn.modeDelimiter(false);
    this.emit('mode_exit', this.cmdHistory.peek());
  }

  /**
   * Registers a custom handler for SIGINT.
   * Vorpal exits with 0 by default
   * on a sigint.
   */
  public sigint(fn: SigIntFn) {
    if (isFunction(fn)) {
      ui.sigint(fn);
    } else {
      throw new Error('vorpal.sigint must be passed in a valid function.');
    }
    return this;
  }

  /**
   * Returns the instance of  given command.
   */
  public find(name: string) {
    return this.commands.find(command => command._name === name);
  }

  /**
   * Registers custom help.
   */
  public help(fn: HelpFn) {
    this._help = fn;
  }

  /**
   * Returns help string for a given command.
   */
  public _commandHelp(command: string) {
    if (!this.commands.length) {
      return '';
    }

    if (this._help !== undefined && typeof this._help === 'function') {
      return this._help(command);
    }

    let matches: Command[] = [];
    const singleMatches = [];

    command = String(command).trim();
    this.commands.forEach(_command => {
      const parts = String(_command._name).split(' ');
      if (parts.length === 1 && parts[0] === command && !_command._hidden && !_command._catch) {
        singleMatches.push(command);
      }
      let str = '';
      for (const part of parts) {
        str = String(str + ' ' + part).trim();
        if (str === command && !_command._hidden && !_command._catch) {
          matches.push(_command);
          break;
        }
      }
    });

    const invalidString =
      command && matches.length === 0 && singleMatches.length === 0
        ? ['', '  Invalid Command. Showing Help:', ''].join('\n')
        : '';

    const commandMatch = matches.length > 0;
    const commandMatchLength = commandMatch
      ? String(command)
          .trim()
          .split(' ').length + 1
      : 1;
    matches = matches.length === 0 ? this.commands : matches;

    const skipGroups = !(matches.length + 6 > process.stdout.rows);

    const commands = matches
      .filter(function(cmd) {
        return !cmd._noHelp;
      })
      .filter(function(cmd) {
        return !cmd._catch;
      })
      .filter(function(cmd) {
        return !cmd._hidden;
      })
      .filter(function(cmd) {
        if (skipGroups === true) {
          return true;
        }
        return (
          String(cmd._name)
            .trim()
            .split(' ').length <= commandMatchLength
        );
      })
      .map(cmd => {
        const args = cmd._args.map(arg => Util.humanReadableArgName(arg)).join(' ');

        return [
          cmd._name +
            (cmd._alias ? '|' + cmd._alias : '') +
            (cmd.options.length ? ' [options]' : '') +
            ' ' +
            args,
          cmd.description() || ''
        ];
      });

    const width = commands.reduce(function(max, commandX) {
      return Math.max(max, commandX[0].length);
    }, 0);

    const counts: {
      [key: string]: number;
    } = {};

    let groups = [
      ...new Set(
        matches
          .filter(function(cmd) {
            return (
              String(cmd._name)
                .trim()
                .split(' ').length > commandMatchLength
            );
          })
          .map(function(cmd) {
            return String(cmd._name)
              .split(' ')
              .slice(0, commandMatchLength)
              .join(' ');
          })
          .map(function(cmd) {
            counts[cmd] = counts[cmd] || 0;
            counts[cmd]++;
            return cmd;
          })
      )
    ].map(function(cmd) {
      const prefix = `    ${Util.pad(cmd + ' *', width)}  ${counts[cmd]} sub-command${
        counts[cmd] === 1 ? '' : 's'
      }.`;
      return prefix;
    });

    groups = skipGroups ? [] : groups;

    const descriptionWidth = process.stdout.columns - (width + 4);

    const commandsString =
      commands.length < 1
        ? ''
        : '\n  Commands:\n\n' +
          commands
            .map(function(cmd) {
              const prefix = '    ' + Util.pad(cmd[0], width) + '  ';
              const suffixArr = wrap(cmd[1], descriptionWidth - 8).split('\n');
              for (let i = 0; i < suffixArr.length; ++i) {
                if (i !== 0) {
                  suffixArr[i] = Util.pad('', width + 6) + suffixArr[i];
                }
              }
              const suffix = suffixArr.join('\n');
              return prefix + suffix;
            })
            .join('\n') +
          '\n\n';

    const groupsString =
      groups.length < 1 ? '' : '  Command Groups:\n\n' + groups.join('\n') + '\n';

    return String(
      this._helpHeader(!!invalidString) + invalidString + commandsString + '\n' + groupsString
    )
      .replace(/\n\n\n/g, '\n\n')
      .replace(/\n\n$/, '\n');
  }

  public _helpHeader(hideTitle: boolean) {
    const header = [];

    if (this._banner) {
      header.push(Util.padRow(this._banner), '');
    }

    // Only show under specific conditions
    if (this._title && !hideTitle) {
      let title = this._title;

      if (this._version) {
        title += ' v' + this._version;
      }

      header.push(Util.padRow(title));

      if (this._description) {
        const descWidth = process.stdout.columns * 0.75; // Only 75% of the screen

        header.push(Util.padRow(wrap(this._description, descWidth)));
      }
    }

    // Pad the top and bottom
    if (header.length) {
      header.unshift('');
      header.push('');
    }

    return header.join('\n');
  }

  /**
   * Abstracts the logic for sending and
   * receiving sockets upstream and downstream.
   *
   * To do: Has the start of logic for vorpal sessions,
   * which I haven't fully confronted yet.
   */
  public _send<E extends keyof Events>(
    str: E,
    direction: 'upstream' | 'downstream',
    data: Parameters<Events[E]>[0] & SessionData
  ) {
    const ssn = this.getSessionById(data.sessionId);
    if (!ssn) {
      throw new Error('No Sessions logged for ID ' + data.sessionId + ' in vorpal._send.');
    }
    if (direction === 'upstream') {
      if (ssn.client) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
        // @ts-ignore
        ssn.client.emit(str, data);
      }
    } else if (direction === 'downstream') {
      if (ssn.server) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
        // @ts-ignore
        ssn.server.emit(str, data);
      }
    }
  }

  /**
   * Handles the 'middleman' in a 3+-way vagrant session.
   * If a vagrant instance is a 'client' and 'server', it is
   * now considered a 'proxy' and its sole purpose is to proxy
   * information through, upstream or downstream.
   *
   * If vorpal is not a proxy, it resolves a promise for further
   * code that assumes one is now an end user. If it ends up
   * piping the traffic through, it never resolves the promise.
   */
  public _proxy(str: keyof Events, direction: 'upstream' | 'downstream', data: SessionData) {
    return new Promise(resolve => {
      const ssn = this.getSessionById(data.sessionId);
      if (ssn && (!ssn.isLocal() && ssn.client)) {
        this._send(str, direction, data);
      } else {
        resolve();
      }
    });
  }

  /**
   * Returns session by id.
   */
  public getSessionById(id?: string) {
    if (isObject(id)) {
      throw new Error(
        'vorpal.getSessionById: id ' + JSON.stringify(id) + ' should not be an object.'
      );
    }
    if (!id) {
      throw new Error('vorpal.getSessionById was called with no ID passed.');
    }

    let ssn = this.server.sessions.find(session => session.id === id);
    ssn = this.session.id === id ? this.session : ssn;
    if (!ssn) {
      const sessions = {
        local: this.session.id,
        server: this.server.sessions.map(session => session.id)
      };
      throw new Error(
        'No session found for id ' +
          id +
          ' in vorpal.getSessionById. Sessions: ' +
          JSON.stringify(sessions)
      );
    }
    return ssn;
  }

  /**
   * Kills a remote vorpal session. If user
   * is running on a direct terminal, will kill
   * node instance after confirmation.
   */
  public exit(options: SessionData) {
    const ssn = this.getSessionById(options.sessionId);
    this.emit('vorpal_exit');
    if (ssn.isLocal()) {
      process.exit(0);
    } else {
      ssn.server && ssn.server.emit('vantage-close-downstream', { sessionId: ssn.id });
    }
  }

  public get activeCommand() {
    return this._command ? this._command.commandInstance : undefined;
  }
}

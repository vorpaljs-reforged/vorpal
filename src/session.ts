/* eslint-disable @typescript-eslint/ban-ts-ignore */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { EventEmitter } from 'events';
import os from 'os';

import _, { noop } from 'lodash';
import TypedEmitter from 'typed-emitter';

import autocomplete, { AutocompleteConfigCallback } from './autocomplete';
import { CommandInstance } from './command-instance';
import Vorpal, { QueuedCommand, InternalExecCallback } from './vorpal';
import History from './history';

interface CommandResponse {
  error?: Error;
  data?: any;
  args?: any;
}

interface Events {
  vorpal_command_cancel: () => void;
}

type TypedEventEmitter = { new(): TypedEmitter<Events> };

export default class Session extends (EventEmitter as TypedEventEmitter) {
  public _registeredCommands = 0;
  public _completedCommands = 0;
  public _commandSetCallback: any;
  public id: string;
  public vorpal?: any;
  public parent: Vorpal;
  public client?: Vorpal; // @todo: actually, never?
  public server?: Vorpal; // @todo: actually, never?
  public authenticating: any;
  public user: any;
  public host: any;
  public address: any;
  public _isLocal: any;
  public _delimiter: string;
  public _modeDelimiter: any;
  public _tabCount: number;
  public cmdHistory: History;
  public _mode?: boolean | string;
  public _histCtr?: number;
  public cancelCommands: any;
  /**
   * Initialize a new `Session` instance.
   *
   * @param {String} name
   * @return {Session}
   * @api public
   */

  constructor(options: any) {
    // eslint-disable-next-line constructor-super
    super();

    options = options || {};
    this.id = options.id || this._guid();
    this.parent = options.parent || undefined;
    this.authenticating = options.authenticating || false;
    this.authenticating = options.authenticated || undefined;
    this.user = options.user || 'guest';
    this.host = options.host;
    this.address = options.address || undefined;
    this._isLocal = options.local || undefined;
    this._delimiter = options.delimiter || String(os.hostname()).split('.')[0] + '~$';
    this._modeDelimiter = undefined;

    // Keeps history of how many times in a row `tab` was
    // pressed on the keyboard.
    this._tabCount = 0;

    this.cmdHistory = this.parent.cmdHistory;

    // Special command mode vorpal is in at the moment,
    // such as REPL. See mode documentation.
    this._mode = undefined;
  }

  /**
   * Pipes logging data through any piped
   * commands, and then sends it to ._log for
   * actual logging.
   *
   * @param {String} [... arguments]
   * @return {Session}
   * @api public
   */
  public log(...args: string[]) {
    return this._log(...args);
  }

  /**
   * Routes logging for a given session.
   * is on a local TTY, or remote.
   *
   * @param {String} [... arguments]
   * @return {Session}
   * @api public
   */
  public _log(...args: any) {
    if (this.isLocal()) {
      this.parent.ui.log(...args);
    } else {
      // If it's an error, expose the stack. Otherwise
      // we get a helpful '{}'.
      const value: any = [];
      for (const arg of args) {
        args.push(arg && arg.stack ? 'Error: ' + arg.message : arg);
      }
      this.parent._send('vantage-ssn-stdout-downstream', 'downstream', {
        sessionId: this.id,
        value
      });
    }
    return this;
  }

  /**
   * Returns whether given session
   * is on a local TTY, or remote.
   *
   * @return {Boolean}
   * @api public
   */
  public isLocal() {
    return this._isLocal;
  }

  /**
   * Maps to vorpal.prompt for a session
   * context.
   *
   * @param {Object} options
   * @param {Function} cb
   * @api public
   */

  public prompt(options: any, cb: any) {
    options = options || {};
    options.sessionId = this.id;
    return this.parent.prompt(options, cb);
  }

  /**
   * Gets the full (normal + mode) delimiter
   * for this session.
   *
   * @return {String}
   * @api public
   */

  public fullDelimiter() {
    return this._delimiter + (this._modeDelimiter !== undefined ? this._modeDelimiter : '');
  }

  /**
   * Sets the delimiter for this session.
   */
  public delimiter<T>(str?: T): T extends string ? this : string {
    if (str === undefined) {
      // Type cast as any here to use function return type
      // https://github.com/microsoft/TypeScript/issues/24929
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return this._delimiter as any;
    }
    this._delimiter = String(str).trim() + ' ';
    if (this.isLocal()) {
      this.parent.ui.refresh();
    } else {
      this.parent._send('vantage-delimiter-downstream', 'downstream', {
        value: str,
        sessionId: this.id
      });
    }
    // Type cast as any here to use function return type
    // https://github.com/microsoft/TypeScript/issues/24929
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this as any;
  }

  /**
   * Sets the mode delimiter for this session.
   *
   * @param {String} str
   * @return {Session}
   * @api public
   */

  public modeDelimiter(str: any) {
    if (str === undefined) {
      return this._modeDelimiter;
    }
    if (!this.isLocal()) {
      this.parent._send('vantage-mode-delimiter-downstream', 'downstream', {
        value: str,
        sessionId: this.id
      });
    } else {
      if (str === false || str === 'false') {
        this._modeDelimiter = undefined;
      } else {
        this._modeDelimiter = String(str).trim() + ' ';
      }
      this.parent.ui.refresh();
    }
    return this;
  }

  /**
   * Returns the result of a keypress
   * string, depending on the type.
   *
   * @param {String} key
   * @param {String} value
   * @return {Function}
   * @api private
   */
  public getKeypressResult(key: string, value?: string, cb: AutocompleteConfigCallback = noop) {
    const keyMatch = ['up', 'down', 'tab'].includes(key);
    if (key !== 'tab') {
      this._tabCount = 0;
    }
    if (keyMatch) {
      if (['up', 'down'].includes(key)) {
        cb(undefined, this.getHistory(key as 'up' | 'down'));
      } else if (key === 'tab') {
        this.getAutocomplete(value, cb);
      }
    } else {
      this._histCtr = 0;
    }
  }

  public history(str?: string) {
    if (str) {
      this.cmdHistory.newCommand(str);
    }
  }

  /**
   * New autocomplete.
   */
  private getAutocomplete(str?: string, cb: AutocompleteConfigCallback = noop) {
    return autocomplete.exec.call(this, str, cb);
  }

  public _autocomplete(str: string, arr: string[]) {
    return autocomplete.match.call(this, str, arr);
  }

  /**
   * Public facing autocomplete helper.
   *
   * @param {String} str
   * @param {Array} arr
   * @return {String}
   * @api public
   */

  public help(command: string) {
    this.log(this.parent._commandHelp(command || ''));
  }

  /**
   * Public facing autocomplete helper.
   *
   * @param {String} str
   * @param {Array} arr
   * @return {String}
   * @api public
   */

  public match(str: string, arr: any) {
    return this._autocomplete(str, arr);
  }

  /**
   * Gets a new command set ready.
   */
  public execCommandSet(wrapper: QueuedCommand, callback: InternalExecCallback) {
    let response: CommandResponse = {};
    // eslint-disable-next-line prefer-const
    let res: any;
    this._registeredCommands = 1;
    this._completedCommands = 0;

    // Create the command instance for the first
    // command and hook it up to the pipe chain.
    const commandInstance = new CommandInstance({
      downstream: wrapper.pipes && wrapper.pipes[0],
      commandObject: wrapper.commandObject,
      commandWrapper: wrapper
    });

    wrapper.commandInstance = commandInstance;

    function sendDones(itm: any) {
      if (itm.commandObject && itm.commandObject._done) {
        itm.commandObject._done.call(itm);
      }
      if (itm.downstream) {
        sendDones(itm.downstream);
      }
    }

    // Called when command is cancelled
    this.cancelCommands = () => {
      const callCancel = function (commandInstanceInner: any) {
        if (_.isFunction(commandInstanceInner.commandObject._cancel)) {
          commandInstanceInner.commandObject._cancel.call(commandInstanceInner);
        }

        if (commandInstanceInner.downstream) {
          callCancel(commandInstanceInner.downstream);
        }
      };

      callCancel(wrapper.commandInstance);

      // Check if there is a cancel method on the promise
      if (res && _.isFunction(res.cancel)) {
        res.cancel(wrapper.commandInstance);
      }

      this.removeListener('vorpal_command_cancel', this.cancelCommands);
      this.cancelCommands = undefined;
      this._commandSetCallback = undefined;
      this._registeredCommands = 0;
      this._completedCommands = 0;
      this.parent.emit('client_command_cancelled', { command: wrapper.command });

      callback(wrapper);
    };

    this.on('vorpal_command_cancel', this.cancelCommands);

    // Gracefully handles all instances of the command completing.
    this._commandSetCallback = () => {
      const err = response.error;
      const data = response.data;
      const argus = response.args;
      if (this.isLocal() && err) {
        let stack;
        if (data && data.stack) {
          stack = data.stack;
        } else if (err && err.stack) {
          stack = err.stack;
        } else {
          stack = err;
        }
        this.log(stack);
        this.parent.emit('client_command_error', { command: wrapper.command, error: err });
      } else if (this.isLocal()) {
        this.parent.emit('client_command_executed', { command: wrapper.command });
      }

      this.removeListener('vorpal_command_cancel', this.cancelCommands);
      this.cancelCommands = undefined;
      callback(wrapper, err, data, argus);
      sendDones(commandInstance);
    };

    const onCompletion: InternalExecCallback = (wrapperInner, err, data?, argus?) => {
      response = {
        error: err,
        data,
        args: argus
      };
      this.completeCommand();
    };

    let valid;
    if (_.isFunction(wrapper.validate)) {
      try {
        // @ts-ignore
        valid = wrapper.validate.call(commandInstance, wrapper.args);
      } catch (e) {
        // Complete with error on validation error
        onCompletion(wrapper, e);
        return this;
      }
    }

    if (valid !== true && valid !== undefined) {
      onCompletion(wrapper, valid || null);
      return this;
    }

    if (wrapper.args && typeof wrapper.args === 'object') {
      wrapper.args.rawCommand = wrapper.command;
    }

    // Call the root command.
    // @ts-ignore
    res = wrapper.fn.call(commandInstance, wrapper.args, function (...argus) {
      // @ts-ignore
      onCompletion(wrapper, argus[0], argus[1], argus);
    });

    // If the command as declared by the user
    // returns a promise, handle accordingly.
    if (res && _.isFunction(res.then)) {
      res
        .then(function (data: any) {
          onCompletion(wrapper, undefined, data);
        })
        .catch(function (err: any) {
          onCompletion(wrapper, true, err);
        });
    }

    return this;
  }

  /**
   * Adds on a command or sub-command in progress.
   * Session keeps tracked of commands,
   * and as soon as all commands have been
   * compelted, the session returns the entire
   * command set as complete.
   *
   * @return {session}
   * @api public
   */
  public registerCommand() {
    this._registeredCommands = this._registeredCommands || 0;
    this._registeredCommands++;
    return this;
  }

  /**
   * Marks a command or subcommand as having completed.
   * If all commands have completed, calls back
   * to the root command as being done.
   *
   * @return {session}
   * @api public
   */
  public completeCommand() {
    this._completedCommands++;
    if (this._registeredCommands <= this._completedCommands) {
      this._registeredCommands = 0;
      this._completedCommands = 0;
      if (this._commandSetCallback) {
        this._commandSetCallback();
      }
      this._commandSetCallback = undefined;
    }
    return this;
  }

  /**
   * Returns the appropriate command history
   * string based on an 'Up' or 'Down' arrow
   * key pressed by the user.
   *
   * @param {String} direction
   * @return {String}
   * @api private
   */

  private getHistory(direction?: 'up' | 'down') {
    let history;
    if (direction === 'up') {
      history = this.cmdHistory.getPreviousHistory();
    } else if (direction === 'down') {
      history = this.cmdHistory.getNextHistory();
    }
    return history;
  }

  /**
   * Generates random GUID for Session ID.
   *
   * @return {GUID}
   * @api private
   */

  public _guid() {
    function s4() {
      return Math.floor((1 + Math.random()) * 0x10000)
        .toString(16)
        .substring(1);
    }
    return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
  }
}

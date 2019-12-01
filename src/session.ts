import {EventEmitter} from 'events';
import os from 'os';
import autocomplete from './autocomplete';
import {CommandInstance} from './command-instance';
import {isFunction, noop} from './utils';
import Vorpal from './vorpal';

interface CommandResponse {
  error?: Error;
  data?: any;
  args?: any;
}

export default class Session extends EventEmitter {
  public _registeredCommands: number;
  public _completedCommands: number;
  public _commandSetCallback: any;
  public id: any;
  public vorpal;
  public parent: Vorpal;
  public authenticating: any;
  public user: any;
  public host: any;
  public address: any;
  public _isLocal: any;
  public _delimiter: any;
  public _modeDelimiter: any;
  public _tabCount: number;
  public cmdHistory: any;
  public _mode: any;
  public _histCtr: number;
  public cancelCommands: any;
  /**
   * Initialize a new `Session` instance.
   *
   * @param {String} name
   * @return {Session}
   * @api public
   */

  constructor(options) {
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
  public _log(...args) {
    const self = this;
    if (this.isLocal()) {
      this.parent.ui.log(...args);
    } else {
      // If it's an error, expose the stack. Otherwise
      // we get a helpful '{}'.
      const value = [];
      for (const arg of args) {
        args.push(arg && arg.stack ? 'Error: ' + arg.message : arg);
      }
      self.parent._send('vantage-ssn-stdout-downstream', 'downstream', {
        sessionId: self.id,
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

  public prompt(options, cb) {
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
   *
   * @param {String} str
   * @return {Session}
   * @api public
   */

  public delimiter(str) {
    if (str === undefined) {
      return this._delimiter;
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
    return this;
  }

  /**
   * Sets the mode delimiter for this session.
   *
   * @param {String} str
   * @return {Session}
   * @api public
   */

  public modeDelimiter(str) {
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
   * @param {Function} cb
   * @return {Function}
   * @api private
   */
  private getKeypressResult(key: string, value, cb = noop) {
    const keyMatch = ['up', 'down', 'tab'].indexOf(key) > -1;
    if (key !== 'tab') {
      this._tabCount = 0;
    }
    if (keyMatch) {
      if (['up', 'down'].indexOf(key) > -1) {
        cb(undefined, this.getHistory(key));
      } else if (key === 'tab') {
        this.getAutocomplete(value, cb);
      }
    } else {
      this._histCtr = 0;
    }
  }

  public history(str) {
    const exceptions = [];
    if (str && exceptions.indexOf(String(str).toLowerCase()) === -1) {
      this.cmdHistory.newCommand(str);
    }
  }

  /**
   * New autocomplete.
   *
   * @param {String} str
   * @param {Function} cb
   * @api private
   */

  private getAutocomplete(str, cb) {
    return autocomplete.exec.call(this, str, cb);
  }

  public _autocomplete(str, arr) {
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

  public help(command) {
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

  public match(str, arr) {
    return this._autocomplete(str, arr);
  }

  /**
   * Gets a new command set ready.
   *
   * @return {session}
   * @api public
   */

  public execCommandSet(wrapper, callback) {
    const self = this;
    let response: CommandResponse = {};
    var res; /* eslint-disable-line no-var */
    const cbk = callback;
    this._registeredCommands = 1;
    this._completedCommands = 0;

    // Create the command instance for the first
    // command and hook it up to the pipe chain.
    const commandInstance = new CommandInstance({
      downstream: wrapper.pipes[0],
      commandObject: wrapper.commandObject,
      commandWrapper: wrapper
    });

    wrapper.commandInstance = commandInstance;

    function sendDones(itm) {
      if (itm.commandObject && itm.commandObject._done) {
        itm.commandObject._done.call(itm);
      }
      if (itm.downstream) {
        sendDones(itm.downstream);
      }
    }

    // Called when command is cancelled
    this.cancelCommands = function() {
      const callCancel = function(commandInstanceInner) {
        if (isFunction(commandInstanceInner.commandObject._cancel)) {
          commandInstanceInner.commandObject._cancel.call(commandInstanceInner);
        }

        if (commandInstanceInner.downstream) {
          callCancel(commandInstanceInner.downstream);
        }
      };

      callCancel(wrapper.commandInstance);

      // Check if there is a cancel method on the promise
      if (res && isFunction(res.cancel)) {
        res.cancel(wrapper.commandInstance);
      }

      self.removeListener('vorpal_command_cancel', self.cancelCommands);
      self.cancelCommands = undefined;
      self._commandSetCallback = undefined;
      self._registeredCommands = 0;
      self._completedCommands = 0;
      self.parent.emit('client_command_cancelled', {command: wrapper.command});

      cbk(wrapper);
    };

    this.on('vorpal_command_cancel', self.cancelCommands);

    // Gracefully handles all instances of the command completing.
    this._commandSetCallback = () => {
      const err = response.error;
      const data = response.data;
      const argus = response.args;
      if (self.isLocal() && err) {
        let stack;
        if (data && data.stack) {
          stack = data.stack;
        } else if (err && err.stack) {
          stack = err.stack;
        } else {
          stack = err;
        }
        self.log(stack);
        self.parent.emit('client_command_error', {command: wrapper.command, error: err});
      } else if (self.isLocal()) {
        self.parent.emit('client_command_executed', {command: wrapper.command});
      }

      self.removeListener('vorpal_command_cancel', self.cancelCommands);
      self.cancelCommands = undefined;
      cbk(wrapper, err, data, argus);
      sendDones(commandInstance);
    };

    function onCompletion(wrapperInner, err, data?, argus?) {
      response = {
        error: err,
        data,
        args: argus
      };
      self.completeCommand();
    }

    let valid;
    if (isFunction(wrapper.validate)) {
      try {
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
    res = wrapper.fn.call(commandInstance, wrapper.args, function(...argus) {
      onCompletion(wrapper, argus[0], argus[1], argus);
    });

    // If the command as declared by the user
    // returns a promise, handle accordingly.
    if (res && isFunction(res.then)) {
      res
        .then(function(data) {
          onCompletion(wrapper, undefined, data);
        })
        .catch(function(err) {
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

  private getHistory(direction) {
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

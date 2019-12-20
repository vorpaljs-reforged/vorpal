import {noop, isFunction} from 'lodash';
import {CommandArgs, ICommand, IcommandInstance} from './types/types';

export class CommandInstance {
  public commandWrapper: any;
  public args: CommandArgs;
  public commandObject: any;
  public command: ICommand;
  public session: any;
  public parent: any;
  public callback: any;
  public downstream: IcommandInstance;
  /**
   * Initialize a new `CommandInstance` instance.
   *
   * @param {Object} params
   * @return {CommandInstance}
   * @api public
   */

  constructor({
    command,
    commandObject,
    args,
    commandWrapper,
    callback,
    downstream
  }: IcommandInstance = {}) {
    this.command = command;
    this.commandObject = commandObject;
    this.args = args;
    this.commandWrapper = commandWrapper;
    this.session = commandWrapper.session;
    this.parent = this.session.parent;
    this.callback = callback;
    this.downstream = downstream;
  }

  /**
   * Cancel running command.
   */

  public cancel() {
    this.session.emit('vorpal_command_cancel');
  }

  /**
   * Route stdout either through a piped command, or the session's stdout.
   */

  public log(...args) {
    if (this.downstream) {
      const fn = this.downstream.commandObject._fn || noop;
      this.session.registerCommand();
      this.downstream.args.stdin = args;
      const onComplete = (err?: Error) => {
        if (this.session.isLocal() && err) {
          this.session.log(err.stack || err);
          this.session.parent.emit('client_command_error', {
            command: this.downstream.command,
            error: err
          });
        }
        this.session.completeCommand();
      };

      const validate = this.downstream.commandObject._validate;
      if (isFunction(validate)) {
        try {
          validate.call(this.downstream, this.downstream.args);
        } catch (e) {
          // Log error without piping to downstream on validation error.
          this.session.log(e.toString());
          onComplete(null);
          return;
        }
      }

      const res = fn.call(this.downstream, this.downstream.args, onComplete);
      if (res && isFunction(res.then)) {
        res.then(onComplete, onComplete);
      }
    } else {
      this.session.log(...args);
    }
  }

  public prompt(a, b, c) {
    return this.session.prompt(a, b, c);
  }

  public delimiter(a, b, c) {
    return this.session.delimiter(a, b, c);
  }

  public help(a, b, c) {
    return this.session.help(a, b, c);
  }

  public match(a, b, c) {
    return this.session.match(a, b, c);
  }
}

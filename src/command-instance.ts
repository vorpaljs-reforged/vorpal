import _ from 'lodash';
import Command from './command';
import Session from './session';
import Vorpal, { QueuedCommand } from './vorpal';

interface CommandInstanceParams {
  commandWrapper: CommandInstance | QueuedCommand;
  args: CommandArgs;
  commandObject: Command;
  command?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  callback?: any;
  downstream?: CommandInstance;
}

export interface CommandArgs {
  [key: string]: string | string[] | object | undefined;
  options?: {
    [key: string]: string | string[] | boolean | undefined;
  };
}

export class CommandInstance {
  public commandWrapper: CommandInstance | QueuedCommand;
  public args: CommandArgs;
  public commandObject: Command;
  public command?: string;
  public session: Session;
  public parent: Vorpal;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public callback: any;
  public downstream?: CommandInstance;

  /**
   * Initialize a new `CommandInstance` instance.
   */
  constructor(params: CommandInstanceParams) {
    const { command, commandObject, args, commandWrapper, callback, downstream } = params;

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
  public log(...args: string[]) {
    if (this.downstream) {
      const fn = this.downstream.commandObject._fn || _.noop;
      this.session.registerCommand();
      this.downstream.args.stdin = args;
      const onComplete = (err?: Error | void) => {
        if (this.session.isLocal() && err) {
          this.session.log(String(err.stack || err));
          this.session.parent.emit('client_command_error', {
            command: (this.downstream && this.downstream.command) || '',
            error: err
          });
        }
        this.session.completeCommand();
      };

      const validate = this.downstream.commandObject._validate;
      if (_.isFunction(validate)) {
        try {
          validate.call(this.downstream, this.downstream.args);
        } catch (e) {
          // Log error without piping to downstream on validation error.
          this.session.log(e.toString());
          onComplete();
          return;
        }
      }

      const res = fn.call(this.downstream, this.downstream.args, onComplete);
      if (typeof res !== 'undefined' && typeof res.then === 'function') {
        res.then(onComplete, onComplete);
      }
    } else {
      this.session.log(...args);
    }
  }

  public prompt(...args: Parameters<Session['prompt']>) {
    return this.session.prompt(...args);
  }

  public delimiter(...args: Parameters<Session['delimiter']>) {
    return this.session.delimiter(...args);
  }

  public help(...args: Parameters<Session['help']>) {
    return this.session.help(...args);
  }

  public match(...args: Parameters<Session['match']>) {
    return this.session.match(...args);
  }
}

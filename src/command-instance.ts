/**
 * Module dependencies.
 */

import _ from 'lodash';
import util from './util';

interface CommandInstanceParams {
  commandWrapper?: any;
  args?: any;
  commandObject?: any;
  command?: any;
  callback?: any;
  downstream?: any;
}
export class CommandInstance {
  public commandWrapper: any;
  public args: any;
  public commandObject: any;
  public command: any;
  public session: any;
  public parent: any;
  public callback: any;
  public downstream: any;
  /**
   * Initialize a new `CommandInstance` instance.
   *
   * @param {Object} params
   * @return {CommandInstance}
   * @api public
   */

  constructor(params: CommandInstanceParams = {}) {
    const {command, commandObject, args, commandWrapper, callback, downstream} = params;
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
      const fn = this.downstream.commandObject._fn || _.noop;
      this.session.registerCommand();
      this.downstream.args.stdin = args;
      const onComplete = (err: Error | undefined) => {
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
      if (_.isFunction(validate)) {
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
      if (res && _.isFunction(res.then)) {
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

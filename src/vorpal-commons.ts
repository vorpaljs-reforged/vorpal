/**
 * Function library for Vorpal's out-of-the-box
 * API commands. Imported into a Vorpal server
 * through vorpal.use(module).
 */

/**
 * Module dependencies.
 */

import _ from 'lodash';
import {IVorpal, ICommand}  from './types';

export default function(vorpal: IVorpal) {
  /**
   * Help for a particular command.
   */

  vorpal
    .command('help [command...]')
    .description('Provides help for a given command.')
    .action(function(this:IVorpal, args, cb) {
      const self = this;
      if (args.command) {
        args.command = args.command.join(' ');
        const commandWithName = _.find(self.parent.commands, {
          _name: String(args.command).trim(),
        });
        if (commandWithName && !commandWithName._hidden) {
          if (_.isFunction(commandWithName._help)) {
            commandWithName._help(args.command, function(str) {
              self.log(str);
              cb();
            });
            return;
          }
          this.log(commandWithName.helpInformation());
        } else {
          this.log(this.parent._commandHelp(args.command));
        }
      } else {
        this.log(this.parent._commandHelp(args.command));
      }
      cb();
    });

  /**
   * Exits Vorpal.
   */

  vorpal
    .command('exit')
    .alias('quit')
    .description('Exits application.')
    .action(function(args) {
      args.options = args.options || {};
      args.options.sessionId = this.session.id;
      this.parent.exit(args.options);
    });
}

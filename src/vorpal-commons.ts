import _ from 'lodash';
import Vorpal from './vorpal';

/**
 * Function library for Vorpal's out-of-the-box
 * API commands. Imported into a Vorpal server
 * through vorpal.use(module).
 */
export default function (vorpal: Vorpal) {
  /**
   * Help for a particular command.
   */
  vorpal.command('');

  vorpal
    .command('help [command...]')
    .description('Provides help for a given command.')
    .action(function (args, cb) {
      if (args.command) {
        args.command = (args.command as string[]).join(' ');
        const commandWithName = _.find(this.parent.commands, {
          _name: String(args.command).trim()
        });
        if (commandWithName && !commandWithName._hidden) {
          if (_.isFunction(commandWithName._help)) {
            commandWithName._help(args.command, str => {
              this.log(str);
              cb && cb();
            });
            return;
          }
          this.log(commandWithName.helpInformation());
        } else {
          this.log(this.parent._commandHelp(args.command));
        }
      } else {
        this.log(this.parent._commandHelp(args.command as string));
      }
      cb && cb();
    });

  /**
   * Exits Vorpal.
   */

  vorpal
    .command('exit')
    .alias('quit')
    .description('Exits application.')
    .action(function (args) {
      args.options = args.options || {};
      args.options.sessionId = this.session.id;
      this.parent.exit(args.options);
    });
}

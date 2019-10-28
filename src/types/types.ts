import {EventEmitter} from 'events';
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

export interface ICommand extends EventEmitter {
    commands: ICommand[];
    options: Option[];
    parent: IVorpal;
    _name: string;
    _catch: Function;
    _hidden: boolean;
    _help: Function;
    _aliases: string[];
    _allowUnknownOptions: boolean;
    _autocomplete: IAutocompleteConfig;
    option(flags, description, autocomplete?): ICommand;
    action(fn): ICommand;
    use(fn): ICommand;
    validate(fn): ICommand;

    cancel(fn): ICommand;
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
    parse(fn);
    after(fn): ICommand;
}

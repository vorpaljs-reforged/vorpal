import {ICommand} from './types';

export interface IAutocomplete {
    exec(str: string, cb: (error: Error | undefined, match: AutocompleteMatch) => unknown): void;
    match(str: string, arr: string[], options: AutocompleteOptions): AutocompleteMatch;
}

export interface Input<T extends AutocompleteMatch = AutocompleteMatch> {
    raw: string;
    prefix: string;
    suffix: string;
    context: T;
    match?: ICommand;
    option?: string;
}

export interface AutocompleteOptions {
    ignoreSlashes?: boolean;
}

export type AutocompleteMatch = string | string[] | undefined;

export type AutocompleteCallback = (data: AutocompleteMatch) => unknown;

export type AutocompleteConfigCallback = (error: Error | undefined, arr: string[]) => void;
export type AutocompleteConfigFn = (
    input: AutocompleteMatch,
    callback: AutocompleteConfigCallback
) => string[];
export type IAutocompleteConfig = string[] | {data: AutocompleteConfigFn};

import minimist = require('minimist');

type CLIArgs = minimist.ParsedArgs & {
  [key: string]: string | boolean | number;
};

const ARGS_PATTERN = /"(.*?)"|'(.*?)'|`(.*?)`|([^\s"]+)/gi;

/**
 * Parses command arguments from multiple sources.
 */
export function parseArgs(input: string, opts: Record<string, any> = null): CLIArgs {
  const args = [];
  let match;

  do {
    match = ARGS_PATTERN.exec(input);

    if (match !== null) {
      args.push(match[1] || match[2] || match[3] || match[4]);
    }
  } while (match !== null);

  const parsedArgs = minimist(args, opts);
  parsedArgs._ = parsedArgs._ || [];

  return parsedArgs;
}

export type InterceptFn = (stdout: string) => string | undefined;

export type UnhookFn = () => void;

/**
 * Intercepts stdout, passes thru callback
 * also pass console.error thru stdout so it goes to callback too
 * (stdout.write and stderr.write are both refs to the same stream.write function)
 * returns an unhook() function, call when done intercepting.
 */
export default function(callback: InterceptFn) {
  const oldStdoutWrite = process.stdout.write;
  const oldConsoleError = console.error;

  function interceptor(string: string) {
    // only intercept the string
    const result = callback(string);
    if (typeof result === 'string') {
      string = result.replace(/\n$/, '') + (result && /\n$/.test(string) ? '\n' : '');
    }
    return string;
  }

  process.stdout.write = (function(write) {
    // @todo: figure out a way to create a function assignable to type of process.stdout.write
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return function(...args: any) {
      args[0] = interceptor(args[0]);
      return write.apply(process.stdout, args);
    };
  })(process.stdout.write);

  console.error = function(...args: string[]) {
    args.unshift('\x1b[31m[ERROR]\x1b[0m');
    console.log(...args);
  };

  // puts back to original
  return function unhook() {
    process.stdout.write = oldStdoutWrite;
    console.error = oldConsoleError;
  };
}

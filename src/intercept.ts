/**
 * Intercepts stdout, passes thru callback
 * also pass console.error thru stdout so it goes to callback too
 * (stdout.write and stderr.write are both refs to the same stream.write function)
 * returns an unhook() function, call when done intercepting
 *
 * @param {Function} callback
 * @return {Function}
 */
export default function(callback) {
  const oldStdoutWrite = process.stdout.write;
  const oldConsoleError = console.error;

  function interceptor(string) {
    // only intercept the string
    const result = callback(string);
    if (typeof result === 'string') {
      string = result.replace(/\n$/, '') + (result && /\n$/.test(string) ? '\n' : '');
    }
    return string;
  }

  process.stdout.write = (function(write) {
    return function(...args) {
      args[0] = interceptor(args[0]);
      return write.apply(process.stdout, args);
    };
  })(process.stdout.write);

  console.error = (function(fn) {
    return function(...args) {
      args.unshift('\x1b[31m[ERROR]\x1b[0m');
      console.log(...args);
    };
  })(console.error);

  // puts back to original
  return function unhook() {
    process.stdout.write = oldStdoutWrite;
    console.error = oldConsoleError;
  };
}

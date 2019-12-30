import {inspect} from 'util';
import {pad} from './utils';

function viewed(str: string) {
  // eslint-disable-next-line no-control-regex
  const re = /\u001b\[\d+m/gm;
  return String(str).replace(re, '');
}

function trimTo(str: string, amt: number) {
  let raw = '';
  const visual = viewed(str).slice(0, amt);
  let result = '';
  for (let i = 0; i < str.length; ++i) {
    raw += str[i];
    if (viewed(raw) === visual) {
      result = raw;
      break;
    }
  }

  if (result.length < amt - 10) {
    return result;
  }

  let newResult = result;
  let found = false;
  for (let j = result.length; j > 0; --j) {
    if (result[j] === ' ') {
      found = true;
      break;
    } else {
      newResult = newResult.slice(0, newResult.length - 1);
    }
  }

  if (found) {
    return newResult;
  }

  return result;
}

/**
 * Initialize a new `Logger` instance.
 *
 * @return {Logger}
 * @api public
 */
function Logger(cons) {
  const logger = cons || console;
  const log = function(...args) {
    logger.log(...args);
  };

  log.cols = function(...args) {
    const width = process.stdout.columns;
    let pads = 0;
    let padsWidth = 0;
    let cols = 0;
    let colsWidth = 0;
    const input = args;

    for (const arg of args) {
      if (typeof arg === 'number') {
        padsWidth += arg;
        pads++;
      }
      if (Array.isArray(arg) && typeof arg[0] === 'number') {
        padsWidth += arg[0];
        pads++;
      }
    }

    cols = args.length - pads;
    colsWidth = Math.floor((width - padsWidth) / cols);

    const lines = [];

    const go = function() {
      let str = '';
      let done = true;
      for (let i = 0; i < input.length; ++i) {
        if (typeof input[i] === 'number') {
          str += pad('', input[i], ' ');
        } else if (Array.isArray(input[i]) && typeof input[i][0] === 'number') {
          str += pad('', input[i][0], input[i][1]);
        } else {
          const chosenWidth = colsWidth + 0;
          let trimmed = trimTo(input[i], colsWidth);
          const trimmedLength = trimmed.length;
          const re = /\\u001b\[\d+m/gm;
          const matches = inspect(trimmed).match(re);
          let color = '';
          // Ugh. We're chopping a line, so we have to look for unfinished
          // color assignments and throw them on the next line.
          if (matches && matches[matches.length - 1] !== '\\u001b[39m') {
            trimmed += '\u001b[39m';
            const number = String(matches[matches.length - 1]).slice(7, 9);
            color = '\x1B[' + number + 'm';
          }
          input[i] = color + String(input[i].slice(trimmedLength, input[i].length)).trim();
          str += pad(String(trimmed).trim(), chosenWidth, ' ');
          if (viewed(input[i]).trim() !== '') {
            done = false;
          }
        }
      }
      lines.push(str);
      if (!done) {
        go();
      }
    };
    go();
    for (let i = 0; i < lines.length; ++i) {
      logger.log(lines[i]);
    }
    return this;
  };

  log.br = function() {
    logger.log(' ');
    return this;
  };

  return this.log;
}

/**
 * Expose `logger`.
 */

export default Logger;

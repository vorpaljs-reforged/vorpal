const _ = require('lodash');
const strip = require('strip-ansi');

const autocomplete = {
  /**
   * Handles tabbed autocompletion.
   *
   * - Initial tabbing lists all registered commands.
   * - Completes a command halfway typed.
   * - Recognizes options and lists all possible options.
   * - Recognizes option arguments and lists them.
   * - Supports cursor positions anywhere in the string.
   * - Supports piping.
   *
   * @param {String} str
   * @return {String} cb
   * @api public
   */

  exec(str, cb) {
    const self = this;
    let input = parseInput(str, this.parent.ui._activePrompt.screen.rl.cursor);
    const commands = getCommandNames(this.parent.commands);
    const vorpalMatch = getMatch(input.context, commands, { ignoreSlashes: true });
    let freezeTabs = false;

    function end(str) {
      const res = handleTabCounts.call(self, str, freezeTabs);
      cb(undefined, res);
    }

    function evaluateTabs(input) {
      if (input.context && input.context[input.context.length - 1] === '/') {
        freezeTabs = true;
      }
    }

    if (vorpalMatch) {
      input.context = vorpalMatch;
      evaluateTabs(input);
      end(assembleInput(input));
      return;
    }

    input = getMatchObject.call(this, input, commands);
    if (input.match) {
      input = parseMatchSection.call(this, input);
      getMatchData.call(self, input, function(data) {
        const dataMatch = getMatch(input.context, data);
        if (dataMatch) {
          input.context = dataMatch;
          evaluateTabs(input);
          end(assembleInput(input));
          return;
        }
        end(filterData(input.context, data));
      });
      return;
    }
    end(filterData(input.context, commands));
  },

  /**
   * Independent / stateless auto-complete function.
   * Parses an array of strings for the best match.
   *
   * @param {String} str
   * @param {Array} arr
   * @return {String}
   * @api private
   */

  match(str, arr, options) {
    arr = arr || [];
    options = options || {};
    arr.sort();
    const arrX = _.clone(arr);
    let strX = String(str);

    let prefix = '';

    if (options.ignoreSlashes !== true) {
      const parts = strX.split('/');
      strX = parts.pop();
      prefix = parts.join('/');
      prefix = parts.length > 0 ? prefix + '/' : prefix;
    }

    const matches = [];
    for (let i = 0; i < arrX.length; i++) {
      if (strip(arrX[i]).slice(0, strX.length) === strX) {
        matches.push(arrX[i]);
      }
    }
    if (matches.length === 1) {
      // If we have a slash, don't add a space after match.
      const space =
        String(strip(matches[0])).slice(strip(matches[0]).length - 1) === '/' ? '' : ' ';
      return prefix + matches[0] + space;
    } else if (matches.length === 0) {
      return undefined;
    } else if (strX.length === 0) {
      return matches;
    }

    const longestMatchLength = matches.reduce(function(previous, current) {
      for (let i = 0; i < current.length; i++) {
        if (previous[i] && current[i] !== previous[i]) {
          return current.substr(0, i);
        }
      }
      return previous;
    }).length;

    // couldn't resolve any further, return all matches
    if (longestMatchLength === strX.length) {
      return matches;
    }

    // return the longest matching portion along with the prefix
    return prefix + matches[0].substr(0, longestMatchLength);
  },
};

/**
 * Tracks how many times tab was pressed
 * based on whether the UI changed.
 *
 * @param {String} str
 * @return {String} result
 * @api private
 */

function handleTabCounts(str, freezeTabs) {
  let result;
  if (_.isArray(str)) {
    this._tabCtr += 1;
    if (this._tabCtr > 1) {
      result = str.length === 0 ? undefined : str;
    }
  } else {
    this._tabCtr = freezeTabs === true ? this._tabCtr + 1 : 0;
    result = str;
  }
  return result;
}

/**
 * Looks for a potential exact match
 * based on given data.
 *
 * @param {String} ctx
 * @param {Array} data
 * @return {String}
 * @api private
 */

function getMatch(ctx, data, options) {
  // Look for a command match, eliminating and then
  // re-introducing leading spaces.
  const len = ctx.length;
  const trimmed = ctx.replace(/^\s+/g, '');
  let match = autocomplete.match(trimmed, data.slice(), options);
  if (_.isArray(match)) {
    return match;
  }
  const prefix = new Array(len - trimmed.length + 1).join(' ');
  // If we get an autocomplete match on a command, finish it.
  if (match) {
    // Put the leading spaces back in.
    match = prefix + match;
    return match;
  }
  return undefined;
}

/**
 * Takes the input object and assembles
 * the final result to display on the screen.
 *
 * @param {Object} input
 * @return {String}
 * @api private
 */

function assembleInput(input) {
  if (_.isArray(input.context)) {
    return input.context;
  }
  const result = (input.prefix || '') + (input.context || '') + (input.suffix || '');
  return strip(result);
}

/**
 * Reduces an array of possible
 * matches to list based on a given
 * string.
 *
 * @param {String} str
 * @param {Array} data
 * @return {Array}
 * @api private
 */

function filterData(str, data) {
  data = data || [];
  let ctx = String(str || '').trim();
  const slashParts = ctx.split('/');
  ctx = slashParts.pop();
  const wordParts = String(ctx)
    .trim()
    .split(' ');
  let res = data.filter(function(item) {
    return strip(item).slice(0, ctx.length) === ctx;
  });
  res = res.map(function(item) {
    let parts = String(item)
      .trim()
      .split(' ');
    if (parts.length > 1) {
      parts = parts.slice(wordParts.length);
      return parts.join(' ');
    }
    return item;
  });
  return res;
}

/**
 * Takes the user's current prompt
 * string and breaks it into its
 * integral parts for analysis and
 * modification.
 *
 * @param {String} str
 * @param {Integer} idx
 * @return {Object}
 * @api private
 */

function parseInput(str, idx) {
  const raw = String(str || '');
  const sliced = raw.slice(0, idx);
  const sections = sliced.split('|');
  let prefix = sections.slice(0, sections.length - 1) || [];
  prefix.push('');
  prefix = prefix.join('|');
  const suffix = getSuffix(raw.slice(idx));
  const context = sections[sections.length - 1];
  return {
    raw,
    prefix,
    suffix,
    context,
  };
}

/**
 * Takes the context after a
 * matched command and figures
 * out the applicable context,
 * including assigning its role
 * such as being an option
 * parameter, etc.
 *
 * @param {Object} input
 * @return {Object}
 * @api private
 */

function parseMatchSection(input) {
  const parts = (input.context || '').split(' ');
  const last = parts.pop();
  const beforeLast = strip(parts[parts.length - 1] || '').trim();
  if (beforeLast.slice(0, 1) === '-') {
    input.option = beforeLast;
  }
  input.context = last;
  input.prefix = (input.prefix || '') + parts.join(' ') + ' ';
  return input;
}

/**
 * Returns a cleaned up version of the
 * remaining text to the right of the cursor.
 *
 * @param {String} suffix
 * @return {String}
 * @api private
 */

function getSuffix(suffix) {
  suffix = suffix.slice(0, 1) === ' ' ? suffix : suffix.replace(/.+?(?=\s)/, '');
  suffix = suffix.slice(1, suffix.length);
  return suffix;
}

/**
 * Compile all available commands and aliases
 * in alphabetical order.
 *
 * @param {Array} cmds
 * @return {Array}
 * @api private
 */

function getCommandNames(cmds) {
  let commands = _.map(cmds, '_name');
  commands = commands.concat.apply(commands, _.map(cmds, '_aliases'));
  commands.sort();
  return commands;
}

/**
 * When we know that we've
 * exceeded a known command, grab
 * on to that command and return it,
 * fixing the overall input context
 * at the same time.
 *
 * @param {Object} input
 * @param {Array} commands
 * @return {Object}
 * @api private
 */

function getMatchObject(input, commands) {
  const len = input.context.length;
  const trimmed = String(input.context).replace(/^\s+/g, '');
  let prefix = new Array(len - trimmed.length + 1).join(' ');
  let match;
  let suffix;
  commands.forEach(function(cmd) {
    const nextChar = trimmed.substr(cmd.length, 1);
    if (trimmed.substr(0, cmd.length) === cmd && String(cmd).trim() !== '' && nextChar === ' ') {
      match = cmd;
      suffix = trimmed.substr(cmd.length);
      prefix += trimmed.substr(0, cmd.length);
    }
  });

  let matchObject = match
    ? _.find(this.parent.commands, { _name: String(match).trim() })
    : undefined;

  if (!matchObject) {
    this.parent.commands.forEach(function(cmd) {
      if ((cmd._aliases || []).indexOf(String(match).trim()) > -1) {
        matchObject = cmd;
      }
      return;
    });
  }

  if (!matchObject) {
    matchObject = _.find(this.parent.commands, { _catch: true });
    if (matchObject) {
      suffix = input.context;
    }
  }

  if (!matchObject) {
    prefix = input.context;
    suffix = '';
  }

  if (matchObject) {
    input.match = matchObject;
    input.prefix += prefix;
    input.context = suffix;
  }
  return input;
}

/**
 * Takes a known matched command, and reads
 * the applicable data by calling its autocompletion
 * instructions, whether it is the command's
 * autocompletion or one of its options.
 *
 * @param {Object} input
 * @param {Function} cb
 * @return {Array}
 * @api private
 */

function getMatchData(input, cb) {
  const string = input.context;
  const cmd = input.match;
  const midOption =
    String(string)
      .trim()
      .slice(0, 1) === '-';
  const afterOption = input.option !== undefined;
  if (midOption === true && !cmd._allowUnknownOptions) {
    const results = [];
    for (let i = 0; i < cmd.options.length; ++i) {
      const long = cmd.options[i].long;
      const short = cmd.options[i].short;
      if (!long && short) {
        results.push(short);
      } else if (long) {
        results.push(long);
      }
    }
    cb(results);
    return;
  }

  function handleDataFormat(str, config, callback) {
    let data = [];
    if (_.isArray(config)) {
      data = config;
    } else if (_.isFunction(config)) {
      const cbk =
        config.length < 2
          ? function() {}
          : function(res) {
              callback(res || []);
            };
      const res = config(str, cbk);
      if (res && _.isFunction(res.then)) {
        res
          .then(function(resp) {
            callback(resp);
          })
          .catch(function(err) {
            callback(err);
          });
      } else if (config.length < 2) {
        callback(res);
      }
      return;
    }
    callback(data);
    return;
  }

  if (afterOption === true) {
    const opt = strip(input.option).trim();
    const shortMatch = _.find(cmd.options, { short: opt });
    const longMatch = _.find(cmd.options, { long: opt });
    const match = longMatch || shortMatch;
    if (match) {
      const config = match.autocomplete;
      handleDataFormat(string, config, cb);
      return;
    }
  }

  let conf = cmd._autocomplete;
  conf = conf && conf.data ? conf.data : conf;
  handleDataFormat(string, conf, cb);
  return;
}

module.exports = autocomplete;

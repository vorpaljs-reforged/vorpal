const path = require('path');
const _ = require('lodash');
const Vantage = require('../../lib/vorpal');

const utils = {
  instances: [],

  spawn: function(options, cb) {
    options = options || {};
    options = _.defaults(options, {
      ports: [],
      ssl: false,
    });

    for (var i = 0; i < options.ports.length; ++i) {
      var vorpal = new Vantage();
      var port = options.ports[i];
      vorpal
        .delimiter(port + ':')
        .use(path.join(__dirname, '/server'))
        .listen(port);
      utils.instances.push(vorpal);
    }

    cb(undefined, utils.instances);
    return;
  },

  kill: function(what, cb) {
    cb = cb || function() {};
  },
};
export default utils;

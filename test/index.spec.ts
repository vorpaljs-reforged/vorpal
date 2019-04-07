import Vorpal from '../lib/vorpal';

const vorpal = new Vorpal();

describe('vorpal', function() {
  describe('constructor', function() {
    it('should exist and be a function', function() {
      expect(Vorpal).toBeDefined();
      expect(typeof Vorpal).toBe('function');
    });
  });

  describe('.parse', function() {
    it('should exist and be a function', function() {
      expect(vorpal.parse).toBeDefined();
      expect(typeof vorpal.parse).toBe('function');
    });

    it('should expose minimist', function() {
      const result = vorpal.parse(['a', 'b', 'foo', 'bar', '-r'], {
        use: 'minimist',
      });
      expect(result.r).toBe(true);
      expect(result._.indexOf('foo') > -1).toBe(true);
      expect(result._.indexOf('bar') > -1).toBe(true);
      expect(result._.length).toBe(2);
    });
  });

  describe('mode context', function() {
    it('parent should have the same context in init and action', function(done) {
      const vorpal = Vorpal();
      let initCtx;
      vorpal
        .mode('ooga')
        .init(function(args, cb) {
          initCtx = this.parent;
          cb();
        })
        .action(function(args, cb) {
          expect(this.parent).toEqual(initCtx);
          cb();
          done();
        });
      vorpal.exec('ooga').then(function() {
        vorpal.exec('booga');
      });
    });
  });
});

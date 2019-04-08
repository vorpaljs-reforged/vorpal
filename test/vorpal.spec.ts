import Vorpal from '../src/vorpal';
import intercept from '../src/intercept';

describe('vorpal', function() {
  let vorpal;

  let vorpalStoutput = '';
  let unmute;
  const mute = function() {
    unmute = intercept(function(str) {
      vorpalStoutput += str;
      return '';
    });
  };
  beforeAll(function() {
    vorpal = new Vorpal();
    vorpal
      .command('foo [args...]')
      .option('-b, --bool')
      .option('-r, --required <str>')
      .option('-o, --optional [str]')
      .action(function(args, cb) {
        return args;
      });

    vorpal
      .command('bar')
      .allowUnknownOptions(true)
      .action(function(args, cb) {
        return args;
      });

    vorpal
      .command('baz')
      .allowUnknownOptions(true)
      .allowUnknownOptions(false)
      .action(function(args, cb) {
        return args;
      });

    vorpal.command('optional [str]').action(function(args, cb) {
      return args;
    });

    vorpal.command('required <str>').action(function(args, cb) {
      return args;
    });

    vorpal.command('multiple <req> [opt] [variadic...]').action(function(args, cb) {
      return args;
    });

    vorpal.command('wrong-sequence [opt] <req> [variadic...]').action(function(args, cb) {
      return args;
    });

    vorpal.command('multi word command [variadic...]').action(function(args, cb) {
      return args;
    });
  });
  describe('argument parsing', function() {
    it('should execute a command with no args', function() {
      const fixture = { options: {} };
      expect(vorpal.execSync('foo')).toEqual(fixture);
    });

    it('should execute a command without an optional arg', function() {
      const fixture = { options: {} };
      expect(vorpal.execSync('optional')).toEqual(fixture);
    });

    it('should execute a command with an optional arg', function() {
      const fixture = { options: {}, str: 'bar' };
      expect(vorpal.execSync('optional bar')).toEqual(fixture);
    });

    it('should execute a command with a required arg', function() {
      const fixture = { options: {}, str: 'bar' };
      expect(vorpal.execSync('required bar')).toEqual(fixture);
    });

    it('should throw help when not passed a required arg', function() {
      mute();
      const fixture = '\n  Missing required argument. Showing Help:';
      expect(vorpal.execSync('required')).toEqual(fixture);
      unmute();
    });

    it('should execute a command with multiple arg types', function() {
      const fixture = {
        options: {},
        req: 'foo',
        opt: 'bar',
        variadic: ['joe', 'smith'],
      };
      expect(vorpal.execSync('multiple foo bar joe smith')).toEqual(fixture);
    });

    it('should correct a command with wrong arg sequences declared', function() {
      const fixture = {
        options: {},
        req: 'foo',
        opt: 'bar',
        variadic: ['joe', 'smith'],
      };
      expect(vorpal.execSync('multiple foo bar joe smith')).toEqual(fixture);
    });

    it('should normalize key=value pairs', function() {
      const fixture = {
        options: {},
        req: "a='b'",
        opt: "c='d and e'",
        variadic: ["wombat='true'", 'a', "fizz='buzz'", "hello='goodbye'"],
      };
      expect(
        vorpal.execSync(
          "multiple a='b' c=\"d and e\" wombat=true a fizz='buzz' \"hello='goodbye'\""
        )
      ).toEqual(fixture);
    });

    it('should NOT normalize key=value pairs when isCommandArgKeyPairNormalized is false', function() {
      const fixture = {
        options: {},
        req: 'hello=world',
        opt: 'hello="world"',
        variadic: ['hello=`world`'],
      };
      vorpal.isCommandArgKeyPairNormalized = false;
      expect(vorpal.execSync('multiple "hello=world" \'hello="world"\' "hello=`world`"')).toEqual(
        fixture
      );
      vorpal.isCommandArgKeyPairNormalized = true;
    });

    it('should execute multi-word command with arguments', function() {
      const fixture = { options: {}, variadic: ['and', 'so', 'on'] };
      expect(vorpal.execSync('multi word command and so on')).toEqual(fixture);
    });

    it('should parse command with undefine in it as invalid', function() {
      const fixture = 'Invalid command.';
      expect(vorpal.execSync('has undefine in it')).toEqual(fixture);
    });
  });

  describe('option parsing', function() {
    it('should execute a command with no options', function() {
      const fixture = { options: {} };
      expect(vorpal.execSync('foo')).toEqual(fixture);
    });

    it('should execute a command with args and no options', function() {
      const fixture = { options: {}, args: ['bar', 'smith'] };
      expect(vorpal.execSync('foo bar smith')).toEqual(fixture);
    });

    describe('options before an arg', function() {
      it('should accept a short boolean option', function() {
        const fixture = { options: { bool: true }, args: ['bar', 'smith'] };
        expect(vorpal.execSync('foo -b bar smith')).toEqual(fixture);
      });

      it('should accept a long boolean option', function() {
        const fixture = { options: { bool: true }, args: ['bar', 'smith'] };
        expect(vorpal.execSync('foo --bool bar smith')).toEqual(fixture);
      });

      it('should accept a short optional option', function() {
        const fixture = {
          options: { optional: 'cheese' },
          args: ['bar', 'smith'],
        };
        expect(vorpal.execSync('foo --o cheese bar smith')).toEqual(fixture);
      });

      it('should accept a long optional option', function() {
        const fixture = {
          options: { optional: 'cheese' },
          args: ['bar', 'smith'],
        };
        expect(vorpal.execSync('foo --optional cheese bar smith')).toEqual(fixture);
      });

      it('should accept a short required option', function() {
        const fixture = {
          options: { required: 'cheese' },
          args: ['bar', 'smith'],
        };
        expect(vorpal.execSync('foo -r cheese bar smith')).toEqual(fixture);
      });

      it('should accept a long required option', function() {
        const fixture = {
          options: { required: 'cheese' },
          args: ['bar', 'smith'],
        };
        expect(vorpal.execSync('foo --required cheese bar smith')).toEqual(fixture);
      });
    });

    describe('options after args', function() {
      it('should accept a short boolean option', function() {
        const fixture = { options: { bool: true }, args: ['bar', 'smith'] };
        expect(vorpal.execSync('foo bar smith -b ')).toEqual(fixture);
      });

      it('should accept a long boolean option', function() {
        const fixture = { options: { bool: true }, args: ['bar', 'smith'] };
        expect(vorpal.execSync('foo bar smith --bool ')).toEqual(fixture);
      });

      it('should accept a short optional option', function() {
        const fixture = {
          options: { optional: 'cheese' },
          args: ['bar', 'smith'],
        };
        expect(vorpal.execSync('foo bar smith --o cheese ')).toEqual(fixture);
      });

      it('should accept a long optional option', function() {
        const fixture = {
          options: { optional: 'cheese' },
          args: ['bar', 'smith'],
        };
        expect(vorpal.execSync('foo bar smith --optional cheese ')).toEqual(fixture);
      });

      it('should accept a short required option', function() {
        const fixture = {
          options: { required: 'cheese' },
          args: ['bar', 'smith'],
        };
        expect(vorpal.execSync('foo bar smith -r cheese ')).toEqual(fixture);
      });

      it('should accept a long required option', function() {
        const fixture = {
          options: { required: 'cheese' },
          args: ['bar', 'smith'],
        };
        expect(vorpal.execSync('foo bar smith --required cheese ')).toEqual(fixture);
      });
    });

    describe('options without an arg', function() {
      it('should accept a short boolean option', function() {
        const fixture = { options: { bool: true } };
        expect(vorpal.execSync('foo -b ')).toEqual(fixture);
      });

      it('should accept a long boolean option', function() {
        const fixture = { options: { bool: true } };
        expect(vorpal.execSync('foo --bool ')).toEqual(fixture);
      });

      it('should accept a short optional option', function() {
        const fixture = { options: { optional: 'cheese' } };
        expect(vorpal.execSync('foo --o cheese ')).toEqual(fixture);
      });

      it('should accept a long optional option', function() {
        const fixture = { options: { optional: 'cheese' } };
        expect(vorpal.execSync('foo --optional cheese ')).toEqual(fixture);
      });

      it('should accept a short required option', function() {
        const fixture = { options: { required: 'cheese' } };
        expect(vorpal.execSync('foo -r cheese ')).toEqual(fixture);
      });

      it('should accept a long required option', function() {
        const fixture = { options: { required: 'cheese' } };
        expect(vorpal.execSync('foo --required cheese ')).toEqual(fixture);
      });
    });

    describe('option validation', function() {
      it('should execute a boolean option without an arg', function() {
        const fixture = { options: { bool: true } };
        expect(vorpal.execSync('foo -b')).toEqual(fixture);
      });

      it('should execute an optional option without an arg', function() {
        const fixture = { options: { optional: true } };
        expect(vorpal.execSync('foo -o')).toEqual(fixture);
      });

      it('should execute an optional option with an arg', function() {
        const fixture = { options: { optional: 'cows' } };
        expect(vorpal.execSync('foo -o cows')).toEqual(fixture);
      });

      it('should execute a required option with an arg', function() {
        const fixture = { options: { required: 'cows' } };
        expect(vorpal.execSync('foo -r cows')).toEqual(fixture);
      });

      it('should throw help on a required option without an arg', function() {
        const fixture = '\n  Missing required value for option --required. Showing Help:';
        mute();
        expect(vorpal.execSync('foo -r')).toEqual(fixture);
        unmute();
      });
    });

    describe('negated options', function() {
      it('should make a boolean option false', function() {
        const fixture = { options: { bool: false }, args: ['cows'] };
        expect(vorpal.execSync('foo --no-bool cows')).toEqual(fixture);
      });

      it('should make an unfilled optional option false', function() {
        const fixture = { options: { optional: false }, args: ['cows'] };
        expect(vorpal.execSync('foo --no-optional cows')).toEqual(fixture);
      });

      it('should ignore a filled optional option', function() {
        const fixture = { options: { optional: false }, args: ['cows'] };
        expect(vorpal.execSync('foo --no-optional cows')).toEqual(fixture);
      });

      it('should return help on a required option', function() {
        const fixture = '\n  Missing required value for option --required. Showing Help:';
        mute();
        expect(vorpal.execSync('foo --no-required cows')).toEqual(fixture);
        unmute();
      });

      it('should throw help on an unknown option', function() {
        const fixture = "\n  Invalid option: 'unknown'. Showing Help:";
        expect(vorpal.execSync('foo --unknown')).toEqual(fixture);
      });

      it('should allow unknown options when allowUnknownOptions is set to true', function() {
        const fixture = { options: { unknown: true } };
        expect(vorpal.execSync('bar --unknown')).toEqual(fixture);
      });

      it('should allow the allowUnknownOptions state to be set with a boolean', function() {
        const fixture = "\n  Invalid option: 'unknown'. Showing Help:";
        expect(vorpal.execSync('baz --unknown')).toEqual(fixture);
      });
    });
  });

  describe('help menu', function() {
    const longFixture =
      'Twas brillig and the slithy toves, did gyre and gimble in the wabe. All mimsy were the borogoves. And the mome wraths outgrabe. Beware the Jabberwock, my son. The claws that bite, the jaws that catch. Beware the jubjub bird and shun, the frumious bandersnatch. Twas brillig and the slithy toves, did gyre and gimble in the wabe. All mimsy were the borogoves. And the mome wraths outgrabe. Beware the Jabberwock, my son. The claws that bite, the jaws that catch. Beware the jubjub bird and shun, the frumious bandersnatch. Twas brillig and the slithy toves, did gyre and gimble in the wabe. All mimsy were the borogoves. And the mome wraths outgrabe. Beware the Jabberwock, my son. The claws that bite, the jaws that catch. Beware the jubjub bird and shun, the frumious bandersnatch.';
    const shortFixture = 'Twas brillig and the slithy toves.';
    let help;

    beforeAll(function() {
      help = new Vorpal();
      help.command('foo [args...]').action(function(args, cb) {
        return args;
      });
    });
  });

  describe('descriptors', function() {
    let instance;

    beforeEach(function() {
      instance = new Vorpal();
    });

    it('sets the version', function() {
      instance.version('1.2.3');
      expect(instance._version).toEqual('1.2.3');
    });

    it('sets the title', function() {
      instance.title('Vorpal');
      expect(instance._title).toEqual('Vorpal');
    });

    it('sets the description', function() {
      instance.description('A CLI tool.');
      expect(instance._description).toEqual('A CLI tool.');
    });

    it('sets the banner', function() {
      instance.banner('VORPAL');
      expect(instance._banner).toEqual('VORPAL');
    });
  });
});

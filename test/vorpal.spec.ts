/**
 * This is the new testing file, as
 * the current one totally sucks.
 * eventually move all tests over to
 * this one.
 */

var Vorpal = require("../");
var intercept = require("../dist/intercept");

var vorpal;

// Normalize inputs to objects.
function obj(inp) {
  if (typeof inp === "string") {
    return "(" + inp + ")";
  } else {
    return JSON.stringify(inp);
  }
}

var vorpalStoutput = "";
var unmute;
var mute = function() {
  unmute = intercept(function(str) {
    vorpalStoutput += str;
    return "";
  });
};

vorpal = Vorpal();
vorpal
  .command("foo [args...]")
  .option("-b, --bool")
  .option("-r, --required <str>")
  .option("-o, --optional [str]")
  .action(function(args, cb) {
    return args;
  });

vorpal
  .command("bar")
  .allowUnknownOptions(true)
  .action(function(args, cb) {
    return args;
  });

vorpal
  .command("baz")
  .allowUnknownOptions(true)
  .allowUnknownOptions(false)
  .action(function(args, cb) {
    return args;
  });

vorpal.command("optional [str]").action(function(args, cb) {
  return args;
});

vorpal.command("required <str>").action(function(args, cb) {
  return args;
});

vorpal.command("multiple <req> [opt] [variadic...]").action(function(args, cb) {
  return args;
});

vorpal
  .command("wrong-sequence [opt] <req> [variadic...]")
  .action(function(args, cb) {
    return args;
  });

vorpal.command("multi word command [variadic...]").action(function(args, cb) {
  return args;
});

describe("argument parsing", function() {
  it("should execute a command with no args", function() {
    var fixture = obj({ options: {} });
    expect(obj(vorpal.execSync("foo"))).toBe(fixture);
  });

  it("should execute a command without an optional arg", function() {
    var fixture = obj({ options: {} });
    expect(obj(vorpal.execSync("optional"))).toBe(fixture);
  });

  it("should execute a command with an optional arg", function() {
    var fixture = obj({ options: {}, str: "bar" });
    expect(obj(vorpal.execSync("optional bar"))).toBe(fixture);
  });

  it("should execute a command with a required arg", function() {
    var fixture = obj({ options: {}, str: "bar" });
    expect(obj(vorpal.execSync("required bar"))).toBe(fixture);
  });

  it("should throw help when not passed a required arg", function() {
    mute();
    var fixture = "\n  Missing required argument. Showing Help:";
    expect(vorpal.execSync("required")).toBe(fixture);
    unmute();
  });

  it("should execute a command with multiple arg types", function() {
    var fixture = obj({
      options: {},
      req: "foo",
      opt: "bar",
      variadic: ["joe", "smith"]
    });
    expect(obj(vorpal.execSync("multiple foo bar joe smith"))).toBe(fixture);
  });

  it("should correct a command with wrong arg sequences declared", function() {
    var fixture = obj({
      options: {},
      req: "foo",
      opt: "bar",
      variadic: ["joe", "smith"]
    });
    expect(obj(vorpal.execSync("multiple foo bar joe smith"))).toBe(fixture);
  });

  it("should normalize key=value pairs", function() {
    var fixture = obj({
      options: {},
      req: "a='b'",
      opt: "c='d and e'",
      variadic: ["wombat='true'", "a", "fizz='buzz'", "hello='goodbye'"]
    });
    expect(
      obj(
        vorpal.execSync(
          "multiple a='b' c=\"d and e\" wombat=true a fizz='buzz' \"hello='goodbye'\""
        )
      )
    ).toBe(fixture);
  });

  it("should NOT normalize key=value pairs when isCommandArgKeyPairNormalized is false", function() {
    var fixture = obj({
      options: {},
      req: "hello=world",
      opt: 'hello="world"',
      variadic: ["hello=`world`"]
    });
    vorpal.isCommandArgKeyPairNormalized = false;
    expect(
      obj(
        vorpal.execSync(
          'multiple "hello=world" \'hello="world"\' "hello=`world`"'
        )
      )
    ).toBe(fixture);
    vorpal.isCommandArgKeyPairNormalized = true;
  });

  it("should execute multi-word command with arguments", function() {
    var fixture = obj({ options: {}, variadic: ["and", "so", "on"] });
    expect(obj(vorpal.execSync("multi word command and so on"))).toBe(fixture);
  });

  it("should parse command with undefine in it as invalid", function() {
    var fixture = obj("Invalid command.");
    expect(obj(vorpal.execSync("has undefine in it"))).toBe(fixture);
  });
});

describe("option parsing", function() {
  it("should execute a command with no options", function() {
    var fixture = obj({ options: {} });
    expect(obj(vorpal.execSync("foo"))).toBe(fixture);
  });

  it("should execute a command with args and no options", function() {
    var fixture = obj({ options: {}, args: ["bar", "smith"] });
    expect(obj(vorpal.execSync("foo bar smith"))).toBe(fixture);
  });

  describe("options before an arg", function() {
    it("should accept a short boolean option", function() {
      var fixture = obj({ options: { bool: true }, args: ["bar", "smith"] });
      expect(obj(vorpal.execSync("foo -b bar smith"))).toBe(fixture);
    });

    it("should accept a long boolean option", function() {
      var fixture = obj({ options: { bool: true }, args: ["bar", "smith"] });
      expect(obj(vorpal.execSync("foo --bool bar smith"))).toBe(fixture);
    });

    it("should accept a short optional option", function() {
      var fixture = obj({
        options: { optional: "cheese" },
        args: ["bar", "smith"]
      });
      expect(obj(vorpal.execSync("foo --o cheese bar smith"))).toBe(fixture);
    });

    it("should accept a long optional option", function() {
      var fixture = obj({
        options: { optional: "cheese" },
        args: ["bar", "smith"]
      });
      expect(obj(vorpal.execSync("foo --optional cheese bar smith"))).toBe(
        fixture
      );
    });

    it("should accept a short required option", function() {
      var fixture = obj({
        options: { required: "cheese" },
        args: ["bar", "smith"]
      });
      expect(obj(vorpal.execSync("foo -r cheese bar smith"))).toBe(fixture);
    });

    it("should accept a long required option", function() {
      var fixture = obj({
        options: { required: "cheese" },
        args: ["bar", "smith"]
      });
      expect(obj(vorpal.execSync("foo --required cheese bar smith"))).toBe(
        fixture
      );
    });
  });

  describe("options after args", function() {
    it("should accept a short boolean option", function() {
      var fixture = obj({ options: { bool: true }, args: ["bar", "smith"] });
      expect(obj(vorpal.execSync("foo bar smith -b "))).toBe(fixture);
    });

    it("should accept a long boolean option", function() {
      var fixture = obj({ options: { bool: true }, args: ["bar", "smith"] });
      expect(obj(vorpal.execSync("foo bar smith --bool "))).toBe(fixture);
    });

    it("should accept a short optional option", function() {
      var fixture = obj({
        options: { optional: "cheese" },
        args: ["bar", "smith"]
      });
      expect(obj(vorpal.execSync("foo bar smith --o cheese "))).toBe(fixture);
    });

    it("should accept a long optional option", function() {
      var fixture = obj({
        options: { optional: "cheese" },
        args: ["bar", "smith"]
      });
      expect(obj(vorpal.execSync("foo bar smith --optional cheese "))).toBe(
        fixture
      );
    });

    it("should accept a short required option", function() {
      var fixture = obj({
        options: { required: "cheese" },
        args: ["bar", "smith"]
      });
      expect(obj(vorpal.execSync("foo bar smith -r cheese "))).toBe(fixture);
    });

    it("should accept a long required option", function() {
      var fixture = obj({
        options: { required: "cheese" },
        args: ["bar", "smith"]
      });
      expect(obj(vorpal.execSync("foo bar smith --required cheese "))).toBe(
        fixture
      );
    });
  });

  describe("options without an arg", function() {
    it("should accept a short boolean option", function() {
      var fixture = obj({ options: { bool: true } });
      expect(obj(vorpal.execSync("foo -b "))).toBe(fixture);
    });

    it("should accept a long boolean option", function() {
      var fixture = obj({ options: { bool: true } });
      expect(obj(vorpal.execSync("foo --bool "))).toBe(fixture);
    });

    it("should accept a short optional option", function() {
      var fixture = obj({ options: { optional: "cheese" } });
      expect(obj(vorpal.execSync("foo --o cheese "))).toBe(fixture);
    });

    it("should accept a long optional option", function() {
      var fixture = obj({ options: { optional: "cheese" } });
      expect(obj(vorpal.execSync("foo --optional cheese "))).toBe(fixture);
    });

    it("should accept a short required option", function() {
      var fixture = obj({ options: { required: "cheese" } });
      expect(obj(vorpal.execSync("foo -r cheese "))).toBe(fixture);
    });

    it("should accept a long required option", function() {
      var fixture = obj({ options: { required: "cheese" } });
      expect(obj(vorpal.execSync("foo --required cheese "))).toBe(fixture);
    });
  });

  describe("option validation", function() {
    it("should execute a boolean option without an arg", function() {
      var fixture = obj({ options: { bool: true } });
      expect(obj(vorpal.execSync("foo -b"))).toBe(fixture);
    });

    it("should execute an optional option without an arg", function() {
      var fixture = obj({ options: { optional: true } });
      expect(obj(vorpal.execSync("foo -o"))).toBe(fixture);
    });

    it("should execute an optional option with an arg", function() {
      var fixture = obj({ options: { optional: "cows" } });
      expect(obj(vorpal.execSync("foo -o cows"))).toBe(fixture);
    });

    it("should execute a required option with an arg", function() {
      var fixture = obj({ options: { required: "cows" } });
      expect(obj(vorpal.execSync("foo -r cows"))).toBe(fixture);
    });

    it("should throw help on a required option without an arg", function() {
      var fixture =
        "\n  Missing required value for option --required. Showing Help:";
      mute();
      expect(vorpal.execSync("foo -r")).toBe(fixture);
      unmute();
    });
  });

  describe("negated options", function() {
    it("should make a boolean option false", function() {
      var fixture = obj({ options: { bool: false }, args: ["cows"] });
      expect(obj(vorpal.execSync("foo --no-bool cows"))).toBe(fixture);
    });

    it("should make an unfilled optional option false", function() {
      var fixture = obj({ options: { optional: false }, args: ["cows"] });
      expect(obj(vorpal.execSync("foo --no-optional cows"))).toBe(fixture);
    });

    it("should ignore a filled optional option", function() {
      var fixture = obj({ options: { optional: false }, args: ["cows"] });
      expect(obj(vorpal.execSync("foo --no-optional cows"))).toBe(fixture);
    });

    it("should return help on a required option", function() {
      var fixture =
        "\n  Missing required value for option --required. Showing Help:";
      mute();
      expect(vorpal.execSync("foo --no-required cows")).toBe(fixture);
      unmute();
    });

    it("should throw help on an unknown option", function() {
      var fixture = "\n  Invalid option: 'unknown'. Showing Help:";
      expect(vorpal.execSync("foo --unknown")).toBe(fixture);
    });

    it("should allow unknown options when allowUnknownOptions is set to true", function() {
      var fixture = obj({ options: { unknown: true } });
      expect(obj(vorpal.execSync("bar --unknown"))).toBe(fixture);
    });

    it("should allow the allowUnknownOptions state to be set with a boolean", function() {
      var fixture = "\n  Invalid option: 'unknown'. Showing Help:";
      expect(vorpal.execSync("baz --unknown")).toBe(fixture);
    });
  });
});

describe("help menu", function() {
  var longFixture =
    "Twas brillig and the slithy toves, did gyre and gimble in the wabe. All mimsy were the borogoves. And the mome wraths outgrabe. Beware the Jabberwock, my son. The claws that bite, the jaws that catch. Beware the jubjub bird and shun, the frumious bandersnatch. Twas brillig and the slithy toves, did gyre and gimble in the wabe. All mimsy were the borogoves. And the mome wraths outgrabe. Beware the Jabberwock, my son. The claws that bite, the jaws that catch. Beware the jubjub bird and shun, the frumious bandersnatch. Twas brillig and the slithy toves, did gyre and gimble in the wabe. All mimsy were the borogoves. And the mome wraths outgrabe. Beware the Jabberwock, my son. The claws that bite, the jaws that catch. Beware the jubjub bird and shun, the frumious bandersnatch.";
  var shortFixture = "Twas brillig and the slithy toves.";
  var help;

  beforeAll(function() {
    help = Vorpal();
    help.command("foo [args...]").action(function(args, cb) {
      return args;
    });
  });
});

describe("descriptors", function() {
  var instance;

  beforeEach(function() {
    instance = Vorpal();
  });

  it("sets the version", function() {
    instance.version("1.2.3");
    expect(instance._version).toBe("1.2.3");
  });

  it("sets the title", function() {
    instance.title("Vorpal");
    expect(instance._title).toBe("Vorpal");
  });

  it("sets the description", function() {
    instance.description("A CLI tool.");
    expect(instance._description).toBe("A CLI tool.");
  });

  it("sets the banner", function() {
    instance.banner("VORPAL");
    expect(instance._banner).toBe("VORPAL");
  });
});

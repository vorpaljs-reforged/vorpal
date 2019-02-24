"use strict";

var Vorpal = require("../dist/vorpal");
var commands = require("./util/server");
var BlueBirdPromise = require("bluebird");
var fs = require("fs");

var intercept = require("../dist/intercept");
let integrationStdoutput = "";
var unmute;
var mute = () => {
  unmute = intercept(function(str) {
    integrationStdoutput += str;
    return "";
  });
};

var vorpal = new Vorpal();
var _all = "";
var _stdout = "";
var _excess = "";

var onStdout = function(str) {
  _stdout += str;
  _all += str;
  return "";
};

var stdout = () => {
  var out = _stdout;
  _stdout = "";
  return String(out || "");
};

const exec = function(cmd, cb) {
  vorpal
    .exec(cmd)
    .then(function(data) {
      cb(undefined, data);
    })
    .catch(function(err) {
      console.log(err);
    });
};

describe("integration tests:", () => {
  describe("vorpal", () => {
    it("should overwrite duplicate commands", () => {
      var arr = ["a", "b", "c"];
      arr.forEach(function(item) {
        vorpal
          .command("overwritten", "This command gets overwritten.")
          .action(function(args, cb) {
            cb(undefined, item);
          });
        vorpal.command("overwrite me").action(function(args, cb) {
          cb(undefined, item);
        });
      });

      vorpal.exec("overwritten", function(err, data) {
        expect(err).toBe(undefined);
        expect(data).toBe("c");
        vorpal.exec("overwrite me", function(err, data) {
          expect(err).toBe(undefined);
          expect(data).toBe("c");
        });
      });
    });

    it("should register and execute aliases", () => {
      vorpal
        .command("i go by other names", "This command has many aliases.")
        .alias("donald trump")
        .alias("sinterclaus", [
          "linus torvalds",
          "nan nan nan nan nan nan nan watman!"
        ])
        .action(function(args, cb) {
          cb(undefined, "You have found me.");
        });

      var ctr = 0;
      var arr = [
        "donald trump",
        "sinterclaus",
        "linus torvalds",
        "nan nan nan nan nan nan nan watman!"
      ];
      function go() {
        if (arr[ctr]) {
          vorpal.exec(arr[ctr], function(err, data) {
            expect(err).toBe(undefined);
            expect(data).toEqual("You have found me.");
            ctr++;
            if (!arr[ctr]) {
            } else {
              go();
            }
          });
        }
      }
      go();
    });

    it("should fail on duplicate alias", () => {
      try {
        vorpal
          .command("This command should crash!", "Any moment now...")
          .alias("Oh no!")
          .alias("Here it comes!")
          .alias("Oh no!");
        fail("Expected an error that was not thrown.");
      } catch (e) {
        expect(e).toBeTruthy();
      }
    });

    it("should validate arguments", () => {
      var errorThrown = new Error("Invalid Argument");
      vorpal
        .command(
          "validate-me [arg]",
          'This command only allows argument "valid"'
        )
        .validate(function(args) {
          this.checkInstance = "this is the instance";
          if (!args || args.arg !== "valid") {
            throw errorThrown;
          }
        })
        .action(function(args, cb) {
          expect(this.checkInstance).toBe("this is the instance");
          cb();
        });

      vorpal.exec("validate-me valid", function(err) {
        expect(err).toBe(undefined);
        vorpal.exec("validate-me invalid", function(err) {
          expect(err).toEqual(errorThrown);
        });
      });
    });
  });

  describe("vorpal execution", () => {
    beforeEach(() => {
      vorpal.pipe(onStdout).use(commands);
    });

    afterEach(() => {
      _excess += stdout();
    });

    describe("promise execution", () => {
      it("should not fail", async () => {
        await vorpal.exec("fail me not");
      });

      it("should fail", async () => {
        try {
          await vorpal.exec("fail me yes");
          fail("Expected failure");
        } catch (e) {
          expect(e).toBeTruthy();
        }
      });
    });

    describe("command execution", () => {
      it("should execute a simple command", () => {
        exec("fuzzy", function(err) {
          expect(stdout()).toBe("wuzzy");
        });
      });

      it("should execute help", () => {
        exec("help", function(err) {
          expect(String(stdout()).toLowerCase()).toContain("help");
        });
      });

      it("should chain two async commands", async () => {
        await vorpal.exec("foo");
        expect(stdout()).toBe("bar");

        await vorpal.exec("fuzzy");
        expect(stdout()).toBe("wuzzy");
      });

      it("should execute a two-word-deep command", () => {
        exec("deep command arg", function(err) {
          expect(stdout()).toBe("arg");
        });
      });

      it("should execute a three-word-deep command", () => {
        exec("very deep command arg", function(err) {
          expect(stdout()).toBe("arg");
        });
      });
    });

    describe("inquirer prompt", () => {
      var parent = Vorpal();

      beforeEach(() => {
        // attach a parent so the prompt will run
        vorpal.ui.attach(parent);
      });

      afterEach(() => {
        vorpal.ui.detach(parent);
      });

      it("should show the default value", function(done) {
        var execPromise = vorpal.exec("prompt default myawesomeproject");

        expect(vorpal.ui.inquirerStdout.join("\n")).toContain(
          "(myawesomeproject)"
        );

        execPromise
          .then(function(s) {
            expect(s.project).toBe("myawesomeproject");
            // stdout should have cleared once the prompt is finished
            expect(vorpal.ui.inquirerStdout.join("\n")).not.toContain(
              "(myawesomeproject)"
            );
            done();
          })
          .catch(function(err) {
            console.log(stdout());
            console.log("b", err.stack);
            fail(err);
            done(err);
          });

        // submit the default
        vorpal.ui.submit();
      });
    });

    describe("synchronous execution", () => {
      it("should execute a sync command", () => {
        var result = vorpal.execSync("sync");
        expect(result).toBe("no args were passed");
      });

      it("should execute a sync command with args", () => {
        var result = vorpal.execSync("sync foobar");
        expect(result).toBe("you said foobar");
      });

      it("should fail silently", () => {
        var result = vorpal.execSync("sync throwme");
        expect(result.message).toBe("You said so...");
      });

      it("should fail loudly if you tell it to", () => {
        try {
          vorpal.execSync("sync throwme", { fatal: true });
          fail();
        } catch (e) {
          expect(e).toBeTruthy();
        }
      });
    });

    describe(".command.help", () => {
      it("should execute a custom help command.", () => {
        exec("custom-help --help", () => {
          expect(String(stdout())).toContain("This is a custom help output.");
        });
      });
    });

    describe(".command.parse", () => {
      it("should add on details to an existing command.", () => {
        exec("parse me in-reverse", () => {
          expect(String(stdout())).toContain("esrever-ni");
        });
      });
    });

    describe("piped commands", () => {
      it("should execute a piped command", () => {
        exec("say cheese | reverse", () => {
          expect(stdout()).toBe("eseehc");
        });
      });

      it("should execute a piped command with double quoted pipe character", () => {
        exec('say "cheese|meat" | reverse', () => {
          expect(stdout()).toBe("taem|eseehc");
        });
      });

      it("should execute a piped command with single quoted pipe character", () => {
        exec("say 'cheese|meat' | reverse", () => {
          expect(stdout()).toBe("taem|eseehc");
        });
      });

      it("should execute a piped command with angle quoted pipe character", () => {
        exec("say `cheese|meat` | reverse", () => {
          expect(stdout()).toBe("taem|eseehc");
        });
      });

      it("should execute multiple piped commands", () => {
        exec("say donut | reverse | reverse | array", () => {
          expect(stdout()).toBe("d,o,n,u,t");
        });
      });
    });

    describe("command parsing and validation", () => {
      it("should parse double quoted command option", () => {
        exec('say "Vorpal\'s command parsing is great"', () => {
          expect(stdout()).toBe("Vorpal's command parsing is great");
        });
      });

      it("should parse single quoted command option", () => {
        exec("say 'My name is \"Vorpal\"', done", () => {
          expect(stdout()).toBe('My name is "Vorpal"');
        });
      });

      it("should parse angle quoted command option", () => {
        exec('say `He\'s "Vorpal"`, done', () => {
          expect(stdout()).toBe('He\'s "Vorpal"');
        });
      });

      it("should parse double quotes pipe character in command argument", () => {
        exec('say "(vorpal|Vorpal)", done', () => {
          expect(stdout()).toBe("(vorpal|Vorpal)");
        });
      });

      it("should parse single quoted pipe character in command argument", () => {
        exec("say '(vorpal|Vorpal)', done", () => {
          expect(stdout()).toBe("(vorpal|Vorpal)");
        });
      });

      it("should parse angle quoted pipe character in command argument", () => {
        exec("say `(vorpal|Vorpal)`, done", () => {
          expect(stdout()).toBe("(vorpal|Vorpal)");
        });
      });

      it("should execute a command when not passed an optional variable", () => {
        exec("optional", () => {
          expect(stdout()).toBe("");
        });
      });

      it("should understand --no-xxx options", () => {
        exec("i want --no-cheese", () => {
          expect(stdout()).toBe("false");
        });
      });

      it("should parse hyphenated options", () => {
        exec("hyphenated-option --dry-run", () => {
          expect(stdout()).toBe("true");
        });
      });

      it("should use minimist's parse through the .types() method", () => {
        exec("typehappy --numberify 4 -s 5", function(err, data) {
          expect(err).toBe(undefined);
          expect(data.options.numberify).toBe(4);
          expect(data.options.stringify).toBe("5");
        });
      });

      it("should ignore variadic arguments when not warranted", () => {
        exec("required something with extra something", function(err, data) {
          expect(err).toBe(undefined);
          expect(data.arg).toBe("something");
        });
      });

      it("should receive variadic arguments as array", () => {
        exec("variadic pepperoni olives pineapple anchovies", function(
          err,
          data
        ) {
          expect(err).toBe(undefined);
          expect(data.pizza).toBe("pepperoni");
          expect(data.ingredients[0]).toBe("olives");
          expect(data.ingredients[1]).toBe("pineapple");
          expect(data.ingredients[2]).toBe("anchovies");
        });
      });

      it("should receive variadic arguments as array when quoted", () => {
        exec("variadic \"pepperoni\" 'olives' `pineapple` anchovies", function(
          err,
          data
        ) {
          expect(err).toBe(undefined);
          expect(data.pizza).toBe("pepperoni");
          expect(data.ingredients[0]).toBe("olives");
          expect(data.ingredients[1]).toBe("pineapple");
          expect(data.ingredients[2]).toBe("anchovies");
        });
      });

      it("should accept variadic args as the first arg", () => {
        exec("variadic-pizza olives pineapple anchovies", function(err, data) {
          expect(err).toBe(undefined);
          expect(data.ingredients[0]).toBe("olives");
          expect(data.ingredients[1]).toBe("pineapple");
          expect(data.ingredients[2]).toBe("anchovies");
        });
      });

      it("should accept a lot of arguments", () => {
        exec("cmd that has a ton of arguments", function(err, data) {
          expect(err).toBe(undefined);
          expect(data.with).toBe("that");
          expect(data.one).toBe("has");
          expect(data.million).toBe("a");
          expect(data.arguments).toBe("ton");
          expect(data.in).toBe("of");
          expect(data.it).toBe("arguments");
        });
      });

      it("should show help when not passed a required variable", () => {
        exec("required", () => {
          expect(stdout().indexOf("Missing required argument") > -1).toBe(true);
        });
      });

      it("should show help when passed an unknown option", () => {
        exec("unknown-option --unknown-opt", () => {
          expect(stdout().indexOf("Invalid option") > -1).toBe(true);
        });
      });

      it("should should execute a command when passed a required variable", () => {
        exec("required foobar", () => {
          expect(stdout()).toBe("foobar");
        });
      });

      it("should show help when passed an invalid command", () => {
        exec("gooblediguck", () => {
          expect(stdout().indexOf("Invalid Command. Showing Help:") > -1).toBe(
            true
          );
        });
      });
    });

    describe("mode", () => {
      it("should enter REPL mode", async () => {
        await vorpal.exec("repl");
        expect(stdout()).toContain("Entering REPL Mode.");
      });

      it("should exit REPL mode properly", async () => {
        await vorpal.exec("exit");
        stdout();
        await vorpal.exec("help");
        expect(stdout()).toContain("exit");
      });
    });

    describe("history", () => {
      var vorpalHistory;
      var UNIT_TEST_STORAGE_PATH = "./.unit_test_cmd_history";
      beforeEach(() => {
        vorpalHistory = new Vorpal();
        vorpalHistory.historyStoragePath(UNIT_TEST_STORAGE_PATH);
        vorpalHistory.history("unit_test");
        vorpalHistory.exec("command1");
        vorpalHistory.exec("command2");
      });

      afterEach(() => {
        // Clean up history
        vorpalHistory.cmdHistory.clear();

        // Clean up directory created to store history
        fs.rmdir(UNIT_TEST_STORAGE_PATH, () => {});
      });

      it("should be able to get history", () => {
        expect(vorpalHistory.session.getHistory("up")).toBe("command2");
        expect(vorpalHistory.session.getHistory("up")).toBe("command1");
        expect(vorpalHistory.session.getHistory("down")).toBe("command2");
        expect(vorpalHistory.session.getHistory("down")).toBe("");
      });

      it("should keep separate history for mode", () => {
        vorpalHistory.cmdHistory.enterMode();
        vorpalHistory.exec("command3");

        expect(vorpalHistory.session.getHistory("up")).toBe("command3");
        expect(vorpalHistory.session.getHistory("up")).toBe("command3");
        expect(vorpalHistory.session.getHistory("down")).toBe("");

        vorpalHistory.cmdHistory.exitMode();

        expect(vorpalHistory.session.getHistory("up")).toBe("command2");
        expect(vorpalHistory.session.getHistory("up")).toBe("command1");
        expect(vorpalHistory.session.getHistory("down")).toBe("command2");
        expect(vorpalHistory.session.getHistory("down")).toBe("");
      });

      it("should persist history", () => {
        var vorpalHistory2 = new Vorpal();
        vorpalHistory2.historyStoragePath(UNIT_TEST_STORAGE_PATH);
        vorpalHistory2.history("unit_test");
        expect(vorpalHistory2.session.getHistory("up")).toBe("command2");
        expect(vorpalHistory2.session.getHistory("up")).toBe("command1");
        expect(vorpalHistory2.session.getHistory("down")).toBe("command2");
        expect(vorpalHistory2.session.getHistory("down")).toBe("");
      });

      it("should ignore consecutive duplicates", () => {
        vorpalHistory.exec("command2");
        expect(vorpalHistory.session.getHistory("up")).toBe("command2");
        expect(vorpalHistory.session.getHistory("up")).toBe("command1");
        expect(vorpalHistory.session.getHistory("down")).toBe("command2");
        expect(vorpalHistory.session.getHistory("down")).toBe("");
      });

      it("should always return last executed command immediately after", () => {
        vorpalHistory.exec("command1");
        vorpalHistory.exec("command2");
        expect(vorpalHistory.session.getHistory("up")).toBe("command2");
        vorpalHistory.exec("command2");
        expect(vorpalHistory.session.getHistory("up")).toBe("command2");
        expect(vorpalHistory.session.getHistory("up")).toBe("command1");
      });
    });

    describe("cancel", () => {
      var longRunningCommand;
      beforeEach(() => {
        longRunningCommand = vorpal
          .command("LongRunning", "This command keeps running.")
          .action(() => {
            var self = this;
            self._cancelled = false;
            var cancelInt = setInterval(() => {
              if (self._cancelled) {
                // break off
                clearInterval(cancelInt);
              }
            }, 1000);
            return new BlueBirdPromise(() => {});
          });
      });
      it("should cancel promise", () => {
        vorpal
          .exec("LongRunning")
          .then(() => {})
          .catch(function(instance) {
            instance._cancelled = true;
          });
        vorpal.session.cancelCommands();
      });
      it("should call registered cancel function", () => {
        longRunningCommand.cancel(() => {
          this._cancelled = true;
        });
        vorpal.exec("LongRunning");
        vorpal.session.cancelCommands();
      });
      it("should be able to call cancel in action", () => {
        vorpal
          .command("SelfCancel", "This command cancels itself.")
          .action(() => {
            this.cancel();
          })
          .cancel(() => {});

        vorpal.exec("SelfCancel");
      });
      it("should handle event client_command_cancelled", () => {
        vorpal.on("client_command_cancelled", () => {});
        longRunningCommand.cancel(() => {
          this._cancelled = true;
        });
        vorpal.exec("LongRunning");
        vorpal.session.cancelCommands();
      });
    });

    describe("events", () => {
      it("should handle event command_registered", () => {
        vorpal.on("command_registered", () => {}).command("newMethod");
      });
      it("should handle event client_keypress", () => {
        vorpal
          .on("client_keypress", () => {
            vorpal.hide();
          })
          .delimiter("")
          .show()
          .ui._activePrompt.onKeypress({ key: "k" });
      });
      it("should handle event client_prompt_submit", () => {
        vorpal
          .on("client_prompt_submit", function(result) {
            expect(result).toBe("");
            vorpal.hide();
          })
          .delimiter("")
          .show()
          .ui.submit("");
      });
      it("should handle event client_command_executed", () => {
        vorpal.on("client_command_executed", () => {});
        vorpal.exec("help");
      });
      it("should handle event client_command_error", () => {
        vorpal.on("client_command_error", () => {});
        vorpal.exec("fail me plzz");
      });
      it("should handle piped event client_command_error", () => {
        var vorpal2 = new Vorpal();
        vorpal2
          .on("client_command_error", () => {})
          .command("fail")
          .action(function(args, cb) {
            cb("failed");
          });
        vorpal2.exec("help | fail | help");
      });
    });

    describe("local storage", () => {
      it("should error if not initialized", () => {
        try {
          vorpal.localStorage.setItem();
          fail("Did not throw the expected error.");
        } catch (e) {
          expect(e).toBeTruthy();
        }

        try {
          vorpal.localStorage.setItem();
          fail("Did not throw the expected error.");
        } catch (e) {
          expect(e).toBeTruthy();
        }

        try {
          vorpal.localStorage.removeItem();
          fail("Did not throw the expected error.");
        } catch (e) {
          expect(e).toBeTruthy();
        }
      });

      it("should error if not passed a unique id", () => {
        try {
          vorpal.localStorage();
          fail("Did not throw the expected error.");
        } catch (e) {
          expect(e).toBeTruthy();
        }
      });

      it("should set and get items", () => {
        var a = new Vorpal();
        a.localStorage("foo");
        a.localStorage.setItem("cow", "lick");
        expect(a.localStorage.getItem("cow")).toBe("lick");
      });
    });
  });
});

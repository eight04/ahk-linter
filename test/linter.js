/* eslint-env mocha */
const assert = require("assert");
const {lint} = require("..");

describe("linter", () => {
  it("no-legacy-assignment", () => {
    const result = lint({code: "a = b"});
    assert.deepStrictEqual(result, [
      {
        code: "no-legacy-assignment",
        message: "avoid legacy assignment",
        start: 0,
        end: 5,
        line: 0,
        col: 0
      }
    ]);
  });
});

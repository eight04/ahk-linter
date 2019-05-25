/* eslint-env mocha */
const fs = require("fs");
const assert = require("assert");
const {parseExpression, createState} = require("../lib/parser");

describe("cases", () => {
  for (const name of fs.readdirSync(`${__dirname}/cases`)) {
    it(name, () => {
      const code = fs.readFileSync(`${__dirname}/cases/${name}/input.ahk`, "utf8");
      const output = JSON.parse(fs.readFileSync(`${__dirname}/cases/${name}/output.json`, "utf8"));
      const state = createState(code);
      parseExpression(state);
      assert.deepStrictEqual(state.value, output);
    });
  }
});

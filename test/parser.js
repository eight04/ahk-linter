/* eslint-env mocha */
const fs = require("fs");
const assertJSON = require("assert-json");
const {parseExpression, createState} = require("../lib/parser");

describe("cases", () => {
  for (const name of fs.readdirSync(`${__dirname}/cases`)) {
    it(name, () => {
      const code = fs.readFileSync(`${__dirname}/cases/${name}/input.ahk`, "utf8");
      const state = createState(code);
      parseExpression(state);
      assertJSON.equalFile(state.value, `${__dirname}/cases/${name}/output.json`);
    });
  }
});

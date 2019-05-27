/* eslint-env mocha */
const fs = require("fs");
const assertJSON = require("assert-json");
const {parse} = require("../lib/parser");

describe("cases", () => {
  for (const name of fs.readdirSync(`${__dirname}/cases`)) {
    it(name, () => {
      const code = fs.readFileSync(`${__dirname}/cases/${name}/input.ahk`, "utf8").replace(/\r\n|\r/g, "\n");
      const ast = parse(code);
      const actual = ast.body.length <= 1 ? ast.body[0] : ast.body;
      assertJSON.equalFile(actual, `${__dirname}/cases/${name}/output.json`);
    });
  }
});

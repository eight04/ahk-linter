const {parse} = require("./lib/parser");

function lint(code) {
  const ast = parse(code);
  console.log(ast);
}

module.exports = {lint};

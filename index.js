const {parse} = require("./lib/parser");

function lint(code) {
  const ast = parse(code);
  // console.log(ast);
  return ast;
}

module.exports = {lint};

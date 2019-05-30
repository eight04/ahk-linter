const {walk} = require("estree-walker");
const {parse} = require("./lib/parser");

function lint({code, throwParseError = true}) {
  const reporter = createReporter();
  let ast;
  try {
    ast = parse(code);
  } catch (err) {
    if (throwParseError || err.start == null) {
      throw err;
    }
    reporter.report({
      code: "syntax",
      message: err.message,
      node: err
    });
  }
  if (ast) {
    walk(ast, {
      enter(node /*, parent, prop, index*/) {
        if (node.type === "LegacyAssignmentExpression") {
          reporter.report({
            code: "no-legacy-assignment",
            message: "avoid legacy assignment",
            node
          });
        }
      }
    });
  }
  return reporter.getList();
}

function createReporter() {
  const warnings = [];
  return {report, getList};
  
  function report({
    code,
    message,
    node,
    start = node.start,
    end = node.end,
    line = node.line,
    col = node.col
  }) {
    warnings.push({code, message, start, end, line, col});
  }
  
  function getList() {
    warnings.sort((a, b) => {
      if (a.start === b.start) {
        return a.end - b.end;
      }
      return a.start - b.start;
    });
    return warnings;
  }
}

module.exports = {lint};

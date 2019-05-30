const {walk} = require("estree-walker");
const {parse} = require("./lib/parser");

function lint({code, throwParseError = true}) {
  if (typeof code !== "string") {
    throw new TypeError(`'code' is not a string`);
  }
  const reporter = createReporter();
  let ast;
  try {
    ast = parse(code);
  } catch (err) {
    if (throwParseError || err.index == null) {
      throw err;
    }
    reporter.report({
      code: "syntax-error",
      message: err.message,
      node: err
    });
  }
  if (ast && ast.body.length) {
    walk(ast, {
      enter(node /*, parent, prop, index*/) {
        if (node.type === "LegacyAssignmentExpression") {
          reporter.report({
            code: "no-legacy-assign",
            message: "avoid legacy assignment",
            node
          });
        }
      }
    });
  } else if (ast) {
    reporter.report({
      code: "empty-file",
      message: "the file is empty"
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
    start = node && node.start || 0,
    end = node && node.end || 0,
    line = node && node.line || 0,
    col = node && node.col || 0
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

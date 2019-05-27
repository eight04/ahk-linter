const {ParseError, tokenToId} = require("./util");
const {parseExpression} = require("./expression");
const {parseStatement} = require("./block");

function parseFlowStatement(state) {
  const token = state.token();
  const parsers = {
    for: parseForStatement,
    if: parseIfStatement,
    loop: parseLoopStatement,
    try: parseTryStatement,
    while: parseWhileStatement
  };
  const type = token.value.toLowerCase();
  if (parsers.hasOwnProperty(type)) {
    parsers[type](state);
  } else {
    state.value = null;
  }
}

function parseForStatement(state) {
  const startToken = state.token();
  state.i++;
  let key = state.token();
  if (!key || key.type !== "word") {
    throw new ParseError(state);
  }
  key = tokenToId(key);
  state.i++;
  const sep = state.token();
  if (!sep) {
    throw new ParseError(state);
  }
  let value;
  if (sep.value === ",") {
    state.i++;
    value = state.token();
    if (!value || value.type !== "word") {
      throw new ParseError(state);
    }
    value = tokenToId(value);
    state.i++;
  }
  if (!state.token() || state.token().value.toLowerCase() !== "in") {
    throw new ParseError(state);
  }
  state.i++;
  parseExpression(state);
  const expression = state.value;
  if (!expression) {
    throw new ParseError(state);
  }
  parseStatement(state);
  if (!state.value) {
    throw new ParseError(state);
  }
  state.value = {
    type: "ForStatement",
    key,
    value,
    expression,
    body: state.value,
    start: startToken.start,
    end: state.value.end,
    line: startToken.line,
    col: startToken.col
  };
}

function parseIfStatement() {}

function parseLoopStatement() {
  
}

function parseTryStatement() {}

function parseWhileStatement() {}

module.exports = {
  parseFlowStatement
};

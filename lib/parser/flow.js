const {ParseError, tokenToId} = require("./util");
const {parseExpression} = require("./expression");
const {parseStatement} = require("./block");
const {parseLegacyLiteral} = require("./command");

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

function parseIsInExpression(state) {
  let left = state.token();
  if (!left || left.type !== "word") {
    state.value = null;
    return;
  }
  left = tokenToId(left);
  state.i++;
  let not = false;
  let op;
  if (state.matchTokens("is", "not")) {
    op = "is";
    not = true;
    state.i += 2;
  } else if (state.matchTokens("is")) {
    op = "is";
    state.i++;
  } else if (state.matchTokens("not", "in")) {
    op = "in";
    not = true;
    state.i += 2;
  } else if (state.matchTokens("in")) {
    op = "in";
    state.i++;
  } else {
    throw new ParseError(state);
  }
  parseLegacyLiteral(state);
  if (!state.value) {
    throw new ParseError(state);
  }
  const right = state.value;
  state.value = {
    type: "IsInExpression",
    left,
    right,
    operator: op,
    reverse: not,
    start: left.start,
    end: right.end,
    line: left.line,
    col: left.col
  };
}

function parseIfStatement(state) {
  const startToken = state.token();
  state.i++;
  const token = state.token();
  if (!token) {
    throw new ParseError(state);
  }
  let test;
  if (token.value === "(") {
    state.i++;
    parseExpression(state);
    if (!state.value) {
      throw new ParseError(state);
    }
    test = state.value;
    const endToken = state.token();
    if (!state.value || endToken.value !== ")") {
      throw new ParseError(state);
    }
    state.i++;
  } else {
    parseIsInExpression(state);
    if (!state.value) {
      throw new ParseError(state);
    }
    test = state.value;
  }
  
  parseStatement(state);
  if (!state.value) {
    throw new ParseError(state);
  }
  const consequent = state.value;
  
  let alternate = null;
  const elseToken = state.token();
  if (elseToken && /^else$/i.test(elseToken.value)) {
    state.i++;
    parseStatement(state);
    if (!state.value) {
      throw new ParseError(state);
    }
    alternate = state.value;
  }
  
  state.value = {
    type: "IfStatement",
    test,
    consequent,
    alternate,
    start: startToken.start,
    end: alternate ? alternate.end : consequent.end,
    line: startToken.line,
    col: startToken.col
  };
}

function parseLoopStatement() {
  
}

function parseTryStatement() {}

function parseWhileStatement() {}

module.exports = {
  parseFlowStatement
};

const {ParseError, tokenToId} = require("./util");
const {parseExpression} = require("./expression");
const {parseStatement} = require("./block");
const {parseLegacyLiteral, parseCommandParams} = require("./command");

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

function parseUntil(state) {
  if (!state.matchToken("until")) {
    state.value = null;
    return;
  }
  state.i++;
  parseExpression(state);
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
  const body = state.value;
  parseUntil(state);
  const until = state.value;
  state.value = {
    type: "ForStatement",
    key,
    value,
    expression,
    body,
    until,
    start: startToken.start,
    end: until ? until.end : body.end,
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
  if (state.matchToken("is", "not")) {
    op = "is";
    not = true;
    state.i += 2;
  } else if (state.matchToken("is")) {
    op = "is";
    state.i++;
  } else if (state.matchToken("not", "in")) {
    op = "in";
    not = true;
    state.i += 2;
  } else if (state.matchToken("in")) {
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

function parseLoopStatement(state) {
  const startToken = state.token();
  state.i++;
  if (!state.eof() && state.token().value === ",") {
    state.i++;
  }
  let loopType = state.token().value.toLowerCase();
  let arguments;
  if (["files", "parse", "read", "reg"].includes(loopType)) {
    parseCommandParams(state);
    arguments = state.value;
  } else {
    loopType = "count";
    parseLegacyLiteral(state, "{");
    arguments = state.value ? [state.value] : [];
  }
  parseStatement(state);
  if (!state.value) {
    throw new ParseError(state);
  }
  const body = state.value;
  parseUntil(state);
  const until = state.value;
  state.value = {
    type: "LoopStatement",
    loopType,
    arguments,
    body,
    until,
    start: startToken.start,
    end: until ? until.end : body.end,
    line: startToken.line,
    col: startToken.col
  };
}

function parseTryStatement(state) {
  const startToken = state.token();
  state.i++;
  parseStatement(state);
  if (!state.value) {
    throw new ParseError(state);
  }
  const block = state.value;
  
  parseCatchClause(state);
  const handler = state.value;
  
  parseFinallyClause(state);
  const finalizer = state.value;
  
  state.value = {
    type: "TryStatement",
    block,
    handler,
    finalizer,
    start: startToken.start,
    end: finalizer ? finalizer.end :
      handler ? handler.end :
      block.end,
    line: startToken.line,
    col: startToken.col
  };
}

function parseCatchClause(state) {
  const startToken = state.token();
  if (!startToken || startToken.value.toLowerCase() !== "catch") {
    state.value = null;
    return;
  }
  state.i++;
  
  let param = null;
  const token = state.token();
  if (token && token.type === "word") {
    param = tokenToId(token);
    state.i++;
  }
  
  parseStatement(state);
  if (!state.value) {
    throw new ParseError(state);
  }
  const body = state.value;
  
  state.value = {
    type: "CatchClause",
    param,
    body,
    start: startToken.start,
    end: body.end,
    line: startToken.line,
    col: startToken.col
  };
}

function parseFinallyClause(state) {
  const startToken = state.token();
  if (!startToken || startToken.value.toLowerCase() !== "finally") {
    state.value = null;
    return;
  }
  state.i++;
  
  parseStatement(state);
}

function parseWhileStatement(state) {
  const startToken = state.token();
  state.i++;
  parseExpression(state);
  if (!state.value) {
    throw new ParseError(state);
  }
  const test = state.value;
  parseStatement(state);
  if (!state.value) {
    throw new ParseError(state);
  }
  const body = state.value;
  state.value = {
    type: "WhileStatement",
    test,
    body,
    start: startToken.start,
    end: body.end,
    line: startToken.line,
    col: startToken.col
  };
}

module.exports = {
  parseFlowStatement
};

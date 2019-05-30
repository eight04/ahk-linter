module.exports = {
  parseCommandStatement,
  parseCommandParams,
  parseLegacyLiteral,
  tokensToLegacyLiteral
};

const {unescapeString, tokenToId} = require("./util");
const {isOp, isAssignment} = require("./expression");

function tokensToLegacyLiteral(tokens) {
  if (!tokens.length) {
    return null;
  }
  let buffer = "";
  let lastToken;
  for (const token of tokens) {
    if (!lastToken) {
      buffer = token.value;
    } else {
      buffer += getOffsetWhitespace(lastToken, token) + token.value;
    }
    lastToken = token;
  }
  return {
    type: "LegacyLiteral",
    raw: buffer,
    value: unescapeString(buffer),
    start: tokens[0].start,
    end: lastToken.end,
    line: tokens[0].line,
    col: tokens[0].col
  };
}

function parseLegacyLiteral(state, stopAt = null) {
  const buffer = [];
  while (!state.eof()) {
    const token = state.token();
    if (token.value === stopAt) {
      break;
    }
    if (!buffer.length) {
      buffer.push(token);
    } else if (token.sol) {
      if (token.joiner || isOp(token.value)) {
        buffer.push(token);
      } else {
        break;
      }
    } else {
      buffer.push(token);
    }
    state.i++;
  }
  state.value = tokensToLegacyLiteral(buffer);
}

function getOffsetWhitespace(a, b) {
  if (a.line === b.line) {
    return " ".repeat(b.start - a.end);
  }
  if (b.joiner) {
    if (a.joiner) {
      return (a.joiner.join ? a.joiner.sep : "\n").repeat(b.line - a.line) +
        " ".repeat(a.joiner.trimLeft ? 0 : b.col);
    }
    return " ".repeat(b.joiner.trimLeft ? 0 : b.col);
  }
  return " ";
}

function parseCommandParams(state) {
  const params = [];
  let param = null;
  while (!state.eof()) {
    const token = state.token();
    if (token.sol && !token.joiner && !isOp(token.value)) {
      break;
    }
    if (token.value === ",") {
      params.push(param);
      param = null;
      state.i++;
    } else {
      parseLegacyLiteral(state, ",");
      param = state.value;
    }
  }
  if (param) {
    params.push(param);
    param = null;
  }
  state.value = params;
}

function isCommand(state) {
  const token = state.token();
  if (token.type !== "word") {
    return false;
  }
  const nextToken = state.token(1);
  if (!nextToken || nextToken.value === ",") {
    return true;
  }
  return nextToken.start !== token.end &&
    (nextToken.type !== "symbol" || !isAssignment(nextToken.value));
}

function parseCommandStatement(state) {
  const start = state.i;
  const startToken = state.token();
  let hash = false;
  
  if (startToken.value === "#" && !state.eol() && startToken.end === state.token(1).start) {
    state.i++;
    hash = true;
  }
  
  if (!isCommand(state)) {
    state.i = start;
    state.value = null;
    return;
  }
  
  const command = tokenToId(state.token());
  state.i++;
  // console.log(state.token());
  if (state.matchToken(",")) {
    state.i++;
  }
  // console.log(state.token());
  let arguments;
  if (state.eof() || state.sol() && !state.token().joiner) {
    arguments = [];
  } else {
    parseCommandParams(state);
    arguments = state.value;
  }
      
  state.value = {
    type: "CommandStatement",
    command,
    hash,
    arguments,
    start: startToken.start,
    end: (arguments.length ? arguments[arguments.length - 1] : command).end,
    line: startToken.line,
    col: startToken.col
  };
}

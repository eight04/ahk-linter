const {unescapeString, tokenToId} = require("./util");
const {isOp} = require("./expression");

function parseLegacyLiteral(state, stopAt = null) {
  let buffer = "";
  let startToken;
  let endToken;
  while (!state.eof()) {
    const token = state.token();
    if (token.value === stopAt) {
      break;
    }
    if (!startToken) {
      startToken = endToken = token;
      buffer = token.value;
    } else if (token.sol) {
      if (token.joiner || isOp(token.value)) {
        buffer += getOffsetWhitespace(endToken, token) + token.value;
        endToken = token;
      } else {
        break;
      }
    } else {
      buffer += getOffsetWhitespace(endToken, token) + token.value;
      endToken = token;
    }
    state.i++;
  }
  state.value = !buffer ? null : {
    type: "LegacyLiteral",
    raw: buffer,
    value: buffer,
    start: startToken.start,
    end: endToken.end,
    line: startToken.line,
    col: startToken.col
  };
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
  let firstToken;
  let lastToken;
  while (!state.eof()) {
    if (!state.continueLine()) {
      break;
    }
    const token = state.token();
    if (token.value === ",") {
      if (!firstToken) {
        params.push(null);
      } else {
        collectParam();
      }
    } else if (!firstToken) {
      firstToken = lastToken = token;
    } else {
      lastToken = token;
    }
    state.i++;
  }
  if (firstToken) {
    collectParam();
  }
  state.value = params;
  
  function collectParam() {
    const raw = state.code.slice(firstToken.start, lastToken.end);
    params.push({
      type: "LegacyLiteral",
      raw,
      value: unescapeString(raw),
      start: firstToken.start,
      end: lastToken.end,
      line: firstToken.line,
      col: lastToken.col
    });
    firstToken = lastToken = null;
  }
}

function parseCommandStatement(state) {
  const start = state.i;
  const startToken = state.token();
  let hash = false;
  
  if (startToken.value === "#" && !state.eol()) {
    state.i++;
    hash = true;
  }
  
  const nameToken = state.token();
  const nextToken = state.token(1);
  
  if (
    nameToken.type !== "word" ||
    nextToken && nextToken.type !== "word" && nextToken.value !== "," &&
    nextToken.value !== "%"
  ) {
    state.i = start;
    state.value = null;
    return;
  }
      
  state.i += nextToken.value === "," ? 2 : 1;
  parseCommandParams(state);
  const params = state.value;
  
  state.value = {
    type: "CommandStatement",
    command: tokenToId(nameToken),
    hash,
    params,
    start: startToken.start,
    end: (params.length ? params[params.length - 1] : nameToken).end,
    line: startToken.line,
    col: startToken.col
  };
}

module.exports = {
  parseCommandStatement,
  parseLegacyLiteral
};

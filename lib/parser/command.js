module.exports = {
  parseCommandStatement,
  parseCommandParams,
  parseLegacyLiteral,
  parseEscapedString,
  tokensToEscapedString,
  tokensToLegacyLiteral
};

const {unescapeString, tokenToId, ParseError} = require("./util");
const {
  isOp, isAssignment, isForcedExpression,
  parseForcedExpression
} = require("./expression");

function tokensToLegacyLiteral(state, tokens) {
  if (!tokens.length) {
    return null;
  }
  let lastToken;
  let varLeft = null;
  let varMiddle = null;
  const variables = [];
  for (const token of tokens) {
    if (varMiddle) {
      if (token.value !== "%" || varMiddle.end !== token.start) {
        throw new ParseError(state, token);
      }
      variables.push(tokenToId(varMiddle));
      varLeft = varMiddle = null;
    } else if (varLeft) {
      if (token.type !== "word" || varLeft.end !== token.start) {
        throw new ParseError(state, token);
      }
      varMiddle = token;
    } else if (token.value === "%" && (!lastToken || lastToken.value !== "`")) {
      varLeft = token;
    }
    lastToken = token;
  }
  if (varLeft) {
    throw new ParseError(state, varLeft);
  }
  const raw = tokensToString(tokens);
  return {
    type: "LegacyLiteral",
    raw,
    value: unescapeString(raw),
    variables,
    start: tokens[0].start,
    end: lastToken.end,
    line: tokens[0].line,
    col: tokens[0].col
  };
}

function tokensToString(tokens) {
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
  return buffer;
}

function tokensToEscapedString(state, tokens) {
  if (!tokens.length) {
    return null;
  }
  const raw = tokensToString(tokens);
  return {
    type: "EscapedString",
    raw,
    value: unescapeString(raw),
    start: tokens[0].start,
    end: tokens[tokens.length - 1].end,
    line: tokens[0].line,
    col: tokens[0].col
  };
}

function parseEscapedString(state) {
  const buffer = [];
  const startIndex = state.i;
  while (!state.eof() && (!state.sol() || state.i === startIndex)) {
    buffer.push(state.token());
    state.i++;
  }
  state.value = tokensToEscapedString(state, buffer);
}

function parseLegacyLiteral(state, stopAt = null) {
  if (isForcedExpression(state)) {
    parseForcedExpression(state, stopAt);
    return;
  }
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
  state.value = tokensToLegacyLiteral(state, buffer);
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

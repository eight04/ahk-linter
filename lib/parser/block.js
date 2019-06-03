module.exports = {
  parseScript,
  parseStatement,
  parseBlockStatement
};

const {parseExpressionStatement} = require("./expression");
const {parseFlowStatement} = require("./flow");
const {parseCommandStatement, tokensToEscapedString} = require("./command");
const {parseHotstringStatement, parseHotkeyStatement} = require("./hotkey");
const {ParseError} = require("./util");

function parseScript(state) {
  parseBody(state);
  if (!state.eof()) {
    throw new ParseError(state);
  }
  const body = state.value;
  state.value = {
    type: "Script",
    body,
    start: body.length ? body[0].start : 0,
    end: body.length ? body[body.length - 1].end : state.code.length,
    line: 0,
    col: 0
  };
}

function parseBody(state) {
  // note that this function doesn't return a node but an array
  const body = [];
  while (!state.eof()) {
    parseStatement(state);
    if (state.value) {
      body.push(state.value);
      if (state.sol()) {
        continue;
      }
    }
    break;
  }
  state.value = body;
}

function parseStatement(state) {
  const parsers = [
    parseHotstringStatement,
    parseHotkeyStatement,
    parseLabelStatement,
    parseBlockStatement,
    parseFlowStatement,
    parseCommandStatement,
    parseExpressionStatement
  ];
  for (const parser of parsers) {
    parser(state);
    if (state.value) {
      return;
    }
  }
}

function parseLabelStatement(state) {
  const startIndex = state.i;
  const startToken = state.token();
  const s = [];
  let preToken;
  let validLabel = false;
  while (!state.eof() && (!state.sol() || state.i === startIndex)) {
    const token = state.token();
    if (token.value === ":" && state.eol()) {
      validLabel = true;
      break;
    }
    if (
      preToken && preToken.end !== token.start ||
      token.value === "," || token.value === "`" || token.value === ":"
    ) {
      break;
    }
    s.push(token);
    state.i++;
  }
  if (!validLabel || !s.length) {
    state.i = startIndex,
    state.value = null;
    return;
  }
  state.i++;
  parseStatement(state);
  const body = state.value;
  state.value = {
    type: "LabeledStatement",
    label: tokensToEscapedString(state, s),
    // FIXME: this is designed for labeled loop. What about other statements?
    body,
    start: startToken.start,
    end: state.token(-1).end,
    line: startToken.line,
    col: startToken.col
  };
}

function parseBlockStatement(state) {
  const startToken = state.token();
  if (!startToken || startToken.value !== "{") {
    state.value = null;
    return;
  }
  state.i++;
  parseBody(state);
  // console.log(state.token());
  const endToken = state.token();
  if (!endToken || endToken.value !== "}") {
    throw new ParseError(state);
  }
  state.i++;
  state.value = {
    type: "BlockStatement",
    body: state.value,
    start: startToken.start,
    end: endToken.end,
    line: startToken.line,
    col: startToken.col
  };
}

const RX_WHITESPACE = /\s+/y;
const RX_LF = /\r?\n/;

function lint(code) {
}

function parse(code) {
  const state = {
    code,
    tokens: [...tokenize(code)],
    token(offset = 0) {
      return this.i + offset < this.tokens.length ?
        this.tokens[this.i + offset] :
        null
    },
    i: 0,
    value: null
  };
  parseBody(state);
  return state.value;
}

function parseBody(state) {
  const body = [];
  let line = {};
  while (state.i < state.tokens.length) {
    const token = state.tokens[state.i];
    if (isHashCommand(state)) {
      parseHashCommand(state);
      body.push(state.value);
    } else if (isCommand(state)) {
      parseCommand(state);
      body.push(state.value);
    } else {
      parseExpression(state);
      body.push(state.value);
    }
  }
  state.value = {
    type: "Body",
    body
  };
}

function parseCommaExpression(state) {
  const body = [];
  while (state) {
    
  }
}

function isContinuation(token) {
  // return /,|/.test(token.value);
}

function parseExpression(state, stopAt) {
  let left;
  let token;
  let line = state.token().line;
  while ((token = state.token())) {
    // FIXME: this is wrong
    if (token.line !== line) {
      if (!isContinuation(token)) {
        state.i--;
        break;
      }
      line = token.line;
    }
    if (!left) {
      if (token.type === "word") {
        const nextToken = state.token(1);
        if (nextToken && nextToken.value === "(" && nextToken.start === token.end) {
          // function call
          state.i += 2;
          parseParameters(state);
          left = {
            type: "CallExpression",
            name: token.value,
            params: state.value,
            start: token.start,
            end: state.token().end,
            line: token.line,
            col: token.col
          };
        } else {
          left = {
            type: "Identifier",
            line: token.line,
            col: token.col,
            start: token.start,
            end: token.end,
            value: token.value
          };
        }
        state.i++;
      } else if (isOp1(token)) {
        state.i++;
        parseExpression(state, token);
        left = {
          type: "UnaryExpression",
          name: token.value,
          expression: state.value,
          line: token.line,
          col: token.col,
          start: token.start,
          end: state.value.end,
        };
      } else if (token.value === "(") {
        state.i++;
        parseExpression(state, token);
        left = {
          type: "GroupExpression",
          line: token.line,
          col: token.col,
          start: token.start,
          end: state.token().end,
          expression: state.value
        };
        state.i++;
      } else {
        throw new Error("Unexpected token");
      }
    } else {
      if (isOp2(token)) {
        if (stopAt && getPrecedence(stopAt) >= getPrecedence(token) && stopAt.value !== ":=") {
          // assignment is always right-hand first
          break;
        }
        parseExpression(state, token);
        left = {
          type: "OperatorExpression",
          name: token.value,
          left,
          right: state.value
          line: token.line,
          col: token.col,
          start: token.start,
          end: state.value.end
        };
      } else if (isOp1(token, true)) {
        if (stopAt && getPrecedence(stopAt) >= getPrecedence(token)) {
          break;
        }
        left = {
          type: "UnaryExpression",
          rightHand: true,
          name: token.value,
          expression: left,
          line: left.line,
          col: left.col,
          start: left.start,
          end: token.end
        };
      } else {
        if (stopAt && getPrecedence(stopAt) >= CONCAT_OPERATOR_PRECEDENCE) {
          break;
        }
        // concat expression
        parseExpression(state, {value: " "});
        left = {
          type: "ConcatExpression",
          left,
          right: state.value,
          line: left.line,
          col: left.col,
          start: left.start,
          end: state.value.end
        };
      }
    }
  }
  state.value = left;
}

function isCommand(state) {
  if (state.token().type !== "word") {
    return false;
  }
  const nextToken = state.token(1);
  return !nextToken || nextToken.type === "word" || nextToken.value === "," ||
    nextToken.value === "%";
}

function parseCommand(state) {
  
}

function isHashCommand(state) {
  if (state.token().value !== "#") {
    return false;
  }
  const nextToken = state.token(1);
  return nextToken && nextToken.type === "word";
}

function parseHashCommand(state) {
  
}

{
  type: ""
  wsBefore: " "
  wsAfter: " "
}
function parseBody(code) {
  const tokens = 
  const body = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type === "whitespace" && !tokens[i].newLine)
  }
  for (const token of tokenize(code)) {
    if (token.value === "#") {
      body.push({
        type: "HashCommand",
        name: ""
        params: []
        line: token.line,
        col: token.col
      });
    }
  }
}

function parseHash();

function parseWhitespace(state) {
  RX_WHITESPACE.lastIndex = state.lastIndex;
  const match = RX_WHITESPACE.exec(state.text);
  const lines = match[0].split(RX_LF);
  if (lines.length >= 1) {
    state.line += lines.length - 1;
    state.col = textWidth(lines[lines.length - 1]);
  } else {
    state.col += textWidth(lines[0]);
  }
  state.lastIndex += match[0].length;
  state.index = state.lastIndex;
}

function textWidth(text) {
  return text.replace("\t", "  ").length;
}

function * tokenize(code) {
  const re = /([\r\n]+)|([^\S\r\n]+)|(\d+)|(\w+)|(;.*)|()|(\S)/y;
  let match;
  let line = 0;
  let col = 0;
  while (match = re.exec(code)) {
    if (match[1]) {
      line++;
      col = 0;
    } else {
      if (match[2]) {
        // pass
      } else if (match[3]) {
        yield token("number");
      } else if (match[4]) {
        yield token("word");
      } else if (match[5]) {
        yield token("comment");
      } else {
        yield token("symbol");
      }
      col += match[0].length;
    }
  }
  
  function token(type) {
    return {
      line,
      col,
      value: match[0],
      type,
      start: match.index,
      end: re.lastIndex
    };
  }
}

module.exports = {lint};

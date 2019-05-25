const OP1_PRECEDENCE = {
  "not": 5,
  "-": 14,
  "!": 14,
  "~": 14,
  "&": 14,
  "*": 14,
  "++": 16,
  "--": 16,
  "new": 17,
  
};

const OP2_PRECEDENCE = {
  ",": 0,
  ":=": 1,
  "+=": 1,
  "-=": 1,
  "*=": 1,
  "/=": 1,
  "//=": 1,
  ".=": 1,
  "|=": 1,
  "&=": 1,
  "^=": 1,
  ">>=": 1,
  "<<=": 1,
  "?": 2,
  ":": 2,
  "or": 3,
  "||": 3,
  "and": 4,
  "&&": 4,
  "=": 6,
  "==": 6,
  "<>": 6,
  "!=": 6,
  ">": 7,
  "<": 7,
  ">=": 7,
  "<=": 7,
  "~-": 8,
  ".": 9,
  "&": 10,
  "^": 10,
  "|": 10,
  "<<": 11,
  ">>": 11,
  "+": 12,
  "-": 12,
  "*": 13,
  "/": 13,
  "//": 13,
  "**": 15,
  "MEMBER_ACCESS": 18
};

function isRHOp(token) {
  return token.value.endsWith("=") &&
    OP2_PRECEDENCE[token.value] < OP2_PRECEDENCE["=="];
}

function isRHUnary(token) {
  return token.value === "++" || token.value === "--";
}

function lint(code) {
  const ast = parse(code);
  console.log(ast);
}

function parse(code) {
  const state = {
    comments: [],
    code,
    tokens: [...tokenize(code)],
    token(offset = 0) {
      return this.eof(offset) ? null : this.tokens[this.i + offset];
    },
    tryCollectComment() {
      const token = this.token();
      if (!token || token.type !== "comment") {
        return false;
      }
      this.comments.push(token);
      this.tokens.splice(state.i, 1);
      return true;
    },
    eof(offset = 0) {
      return this.i + offset >= this.tokens.length || this.i + offset < 0;
    },
    inLine(line) {
      return this.token().line === line;
    },
    i: 0,
    value: null
  };
  parseBody(state);
  return state.value;
}

function parseBody(state) {
  const body = [];
  while (!state.eof()) {
    // debugger;
    if (state.tryCollectComment()) {
      continue;
    }
    if (isHashCommand(state)) {
      parseHashCommand(state);
      body.push(state.value);
    } else if (isCommand(state)) {
      parseCommand(state);
      body.push(state.value);
    } else {
      parseExpression(state);
      if (state.value) {
        body.push(state.value);
      } else {
        throw new Error("Unexpected token");
      }
    }
  }
  state.value = {
    type: "Body",
    body
  };
}

function parseParameters(state) {
  parseExpression(state);
  if (state.value) {
    state.value = [...expandComma(state.value)];
  } else {
    state.value = [];
  }
}

function * expandComma(exp) {
  if (exp.type === "BinaryOperatorExpression" && exp.name === ",") {
    yield exp.left;
    yield * expandComma(exp.right);
  } else {
    yield exp;
  }
}

function parseExpression(state, precedenceFloor = -1) {
  let left;
  let token;
  let line = state.token().line;
  while ((token = state.token())) {
    // expression ends with line end
    if (token.line !== line) {
      if (token.type === "symbol") {
        // multiline continuation
        line = token.line;
      } else {
        break;
      }
    }
    const lowerCaseValue = token.value.toLowerCase();
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
      } else if (token.type === "number") {
        left = {
          type: "Number",
          line: token.line,
          col: token.col,
          start: token.start,
          end: token.end,
          value: token.value
        };
        state.i++;
      } else if (OP1_PRECEDENCE.hasOwnProperty(lowerCaseValue)) {
        state.i++;
        parseExpression(state, OP1_PRECEDENCE[lowerCaseValue]);
        left = {
          type: "UnaryOperatorExpression",
          name: token.value,
          expression: state.value,
          line: token.line,
          col: token.col,
          start: token.start,
          end: state.value.end,
        };
      } else if (token.value === "(") {
        state.i++;
        parseExpression(state);
        left = {
          type: "GroupExpression",
          line: token.line,
          col: token.col,
          start: token.start,
          end: state.token().end,
          expression: state.value
        };
        state.i++;
      /* FIXME: you can only variable expand expression *right after* an identifier?
      } else if (token.value === "%") {
        state.i++;
        state.assertType("word");
        const id = state.token().value;
        state.i++;
        state.assertValue("%");
        left = {
          type: "VariableExpression",
          line: token.line,
          col: token.col,
          start: token.start,
          end: state.token().end,
          id
        };
        state.i++;
      */
      } else {
        // expression end?
        break;
      }
    } else {
      if (OP2_PRECEDENCE.hasOwnProperty(lowerCaseValue) && (
        OP2_PRECEDENCE[lowerCaseValue] > precedenceFloor ||
        OP2_PRECEDENCE[lowerCaseValue] == precedenceFloor && isRHOp(token)
      )) {
        state.i++;
        parseExpression(state, OP2_PRECEDENCE[lowerCaseValue]);
        left = {
          type: "BinaryOperatorExpression",
          name: token.value,
          left,
          right: state.value,
          line: token.line,
          col: token.col,
          start: token.start,
          end: state.value.end
        };
      } else if (isRHUnary(token)) {
        left = {
          type: "UnaryOperatorExpression",
          rightHand: true,
          name: token.value,
          expression: left,
          line: left.line,
          col: left.col,
          start: left.start,
          end: token.end
        };
      } else if (OP2_PRECEDENCE["."] > precedenceFloor) {
        // implicit concat expression
        parseExpression(state, OP2_PRECEDENCE["."]);
        if (!state.value) {
          // concat if right hand is a valid expression
          left = {
            type: "BinaryOperatorExpression",
            name: ".",
            left,
            right: state.value,
            line: left.line,
            col: left.col,
            start: left.start,
            end: state.value.end
          };
        }
      } else {
        break;
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
  const nameToken = state.token();
  
  state.i++;
  if (state.token().value === ",") {
    state.i++;
  }
  parseCommandParams(state, nameToken.line);
  const params = state.value;
  
  state.value = {
    type: "Command",
    name: nameToken.value,
    start: nameToken.start,
    end: (params.length ? params[params.length - 1] : nameToken).end,
    line: nameToken.line,
    col: nameToken.col,
    params
  };
}

function parseCommandParams(state, line) {
  const params = [];
  let firstToken;
  let lastToken;
  while (state.inLine(line)) {
    if (state.tryCollectComment()) {
      continue;
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
    params.push({
      type: "String",
      value: state.code.slice(firstToken.start, lastToken.end),
      start: firstToken.start,
      end: lastToken.end,
      line: firstToken.line,
      col: lastToken.col
    });
    firstToken = lastToken = null;
  }
}

function isHashCommand(state) {
  if (state.token().value !== "#") {
    return false;
  }
  const nextToken = state.token(1);
  return nextToken && nextToken.type === "word";
}

function parseHashCommand(state) {
  const token = state.token();
  state.i++;
  parseCommand(state);
  state.value.start = token.start;
  state.value.col = token.col;
  state.value.type = "HashCommand";
}

function * tokenize(code) {
  const re = /(\r\n|\n|\r)|([^\S\r\n]+)|(\d+)|(\w+)|(;.*)|(\bnew\b|\/\/=|>>=|<<=|\+\+|--|\*\*|\/\/|<<|>>|~=|<=|>=|==|<>|!=|not|and|&&|or|\|\||:=|\+=|-=|\*=|\/=|\.=|\|=|&=|^=)|(\S)/iy;
  let match;
  let line = 0;
  let col = 0;
  while ((match = re.exec(code))) {
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
      } else if (match[6]) {
        // multi-char operator?
        yield token("symbol");
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

module.exports = {lint, parse};

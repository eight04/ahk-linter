const OP1_PRECEDENCE = {
  "not": 5,
  "-": 14,
  "!": 14,
  "~": 14,
  "&": 14,
  "*": 14,
  "++": 16,
  "--": 16,
  "new": 17
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

const UNESCAPE_TABLE = {
  "`,": ",",
  "`%": "%",
  "``": "`",
  "`;": ";",
  "`n": "\n",
  "`r": "\r",
  "`b": "\b",
  "`t": "\t",
  "`v": "\v",
  "`a": "\x07",
  "`f": "\x0c",
  '""': '"'
};

const LITERAL_VALUE_EXTRACTOR = {
  number: Number,
  boolean: t => t[0] === "t" || t[0] === "T" ? true : false,
  string: extractStringValue
};

class ParseError extends Error {
  constructor(state) {
    const token = state.token();
    super(token ? `Unexpected token: ${token.value}` : `Unexpected EOF`);
    this.type = "ParseError";
    if (token) {
      this.line = token.line;
      this.col = token.col;
      this.index = token.start;
    } else {
      const lastToken = state.token(-1);
      this.line = lastToken.line;
      this.col = lastToken.col + lastToken.value.length;
      this.index = lastToken.end;
    }
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

function extractStringValue(text) {
  return text.slice(1, -1).replace(/`.|""/g, t => {
    return UNESCAPE_TABLE[t] || t.slice(1);
  });
}

function isRHOp(token) {
  return token.value.endsWith("=") &&
    OP2_PRECEDENCE[token.value] < OP2_PRECEDENCE["=="];
}

function isRHUnary(token) {
  return token.value === "++" || token.value === "--";
}

function createState(code) {
  return {
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
      this.tokens.splice(this.i, 1);
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
}

function parse(code) {
  const state = createState(code);
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
        throw new ParseError(state);
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
  if (exp.type === "BinaryExpression" && exp.name === ",") {
    yield exp.left;
    yield * expandComma(exp.right);
  } else {
    yield exp;
  }
}

function parseExpression(state, precedenceFloor = -1) {
  let left;
  let token;
  let iter = 0;
  while ((token = state.token())) {
    iter++;
    // expression ends with line end
    if (iter > 1) {
      const preToken = state.token(-1);
      if (preToken && (
        preToken.line + 1 < token.line ||
        preToken.line + 1 === token.line && token.type !== "symbol"
      )) {
        // multiline continuation?
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
            name: token.value
          };
        }
        state.i++;
        continue;
      }
      
      if (token.type === "number" || token.type === "string" || token.type === "boolean") {
        left = {
          type: "Literal",
          line: token.line,
          col: token.col,
          start: token.start,
          end: token.end,
          value: LITERAL_VALUE_EXTRACTOR[token.type](token.value),
          raw: token.value
        };
        state.i++;
        continue;
      }
      
      if (OP1_PRECEDENCE.hasOwnProperty(lowerCaseValue)) {
        state.i++;
        parseExpression(state, OP1_PRECEDENCE[lowerCaseValue]);
        left = {
          type: "UnaryExpression",
          name: token.value,
          expression: state.value,
          line: token.line,
          col: token.col,
          start: token.start,
          end: state.value.end,
        };
        continue;
      }
      
      if (token.value === "(") {
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
        continue;
      }
      
      if (token.value === "{") {
        parseObject(state);
        left = state.value;
        continue;
      }
    } else {
      if (OP2_PRECEDENCE.hasOwnProperty(lowerCaseValue) && (
        OP2_PRECEDENCE[lowerCaseValue] > precedenceFloor ||
        OP2_PRECEDENCE[lowerCaseValue] == precedenceFloor && isRHOp(token)
      )) {
        state.i++;
        parseExpression(state, OP2_PRECEDENCE[lowerCaseValue]);
        if (!state.value) {
          throw new ParseError(state);
        }
        left = {
          type: "BinaryExpression",
          name: token.value,
          left,
          right: state.value,
          line: left.line,
          col: left.col,
          start: left.start,
          end: state.value.end
        };
        continue;
      }
      
      if (isRHUnary(token)) {
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
        continue;
      }
      
      if (OP2_PRECEDENCE["."] > precedenceFloor) {
        // implicit concat expression
        parseExpression(state, OP2_PRECEDENCE["."]);
        if (!state.value) {
          // right hand is not a valid expression, expression end
          break;
        }
        left = {
          type: "BinaryExpression",
          name: ".",
          left,
          right: state.value,
          line: left.line,
          col: left.col,
          start: left.start,
          end: state.value.end
        };
        continue;
      }
    }
    break;
  }
  state.value = left;
}

function parseObject(state) {
  const token = state.token();
  state.i++;
  parsePropertyList(state);
  const lastToken = state.token();
  if (!lastToken || lastToken.value !== "}") {
    throw new ParseError(state);
  }
  state.i++;
  state.value = {
    type: "ObjectExpression",
    start: token.start,
    end: lastToken.end,
    line: token.line,
    col: token.col,
    properties: state.value
  };
}

function parsePropertyList(state) {
  const properties = [];
  if (state.token() && state.token().value !== "}") {
    while (!state.eof()) {
      parseExpression(state, Infinity);
      const key = state.value;
      if (!key) {
        throw new ParseError(state);
      }
      if (state.token().value !== ":") {
        throw new ParseError(state);
      }
      state.i++;
      parseExpression(state, OP2_PRECEDENCE[","]);
      if (!state.value) {
        throw new ParseError(state);
      }
      const value = state.value;
      properties.push({
        type: "Property",
        key,
        value,
        start: key.start,
        end: value.end,
        line: key.line,
        col: key.col
      });
      const nextToken = state.token();
      if (nextToken.value === ",") {
        state.i++;
      } else if (nextToken.value === "}") {
        break;
      } else {
        throw new ParseError(state);
      }
    }
  }
  state.value = properties;
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
  const re = /(\r\n|\n|\r)|([^\S\r\n]+)|(0x[0-9a-f]+|\d+(?:\.\d+)?)|\b(true|false)\b|(\w+)|(;.*)|(\bnew\b|\/\/=|>>=|<<=|\+\+|--|\*\*|\/\/|<<|>>|~=|<=|>=|==|<>|!=|not|and|&&|or|\|\||:=|\+=|-=|\*=|\/=|\.=|\|=|&=|^=)|("(?:[^"\r\n]|"")*")|(\S)/iy;
  const types = [
    "newline", "whitespace", "number", "boolean", "word", "comment",
    "symbol" /* multichar symbol? */, "string", "symbol"
  ];
  let match;
  let line = 0;
  let col = 0;
  while ((match = re.exec(code))) {
    const type = getType(match);
    if (type === "newline") {
      line++;
      col = 0;
    } else {
      if (type === "whitespace") {
        // pass
      } else {
        yield token(type);
      }
      col += match[0].length;
    }
  }
  
  function getType(match) {
    for (let i = 1; i < match.length; i++) {
      if (match[i]) {
        return types[i - 1];
      }
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

module.exports = {
  parse,
  parseExpression,
  createState
};

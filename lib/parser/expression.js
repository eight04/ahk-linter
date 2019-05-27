const {ParseError, unescapeString} = require("./util");

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
  "**": 15
};

const OP3_PRECEDENCE = {
  "?": 2,
  ":": 2
};

const LITERAL_VALUE_EXTRACTOR = {
  number: Number,
  boolean: t => t[0] === "t" || t[0] === "T" ? true : false,
  string: t => unescapeString(t.slice(1, -1))
};

function isRHOp(token) {
  return token.value.endsWith("=") &&
    OP2_PRECEDENCE[token.value] < OP2_PRECEDENCE["=="];
}

function isRHUnary(token) {
  return token.value === "++" || token.value === "--";
}

function parseExpressionStatement(state) {
  parseExpression(state);
  if (!state.eof() && !state.sol()) {
    throw new ParseError(state);
  }
}

function parseCommaList(state) {
  const preToken = state.token(-1);
  const elements = [];
  let el = null;
  while (!state.eof()) {
    const token = state.token();
    if (token.value === ",") {
      elements.push(el);
      state.i++;
      el = null;
      continue;
    }
    
    if (token.value === "*" && el && el.type !== "VariadicExpression") {
      el = {
        type: "VariadicExpression",
        argument: el,
        start: el.start,
        end: token.end,
        line: el.line,
        col: el.col
      };
      state.i++;
      continue;
    }
    
    parseExpression(state, OP2_PRECEDENCE[","]);
    if (!state.value) {
      break;
    }
    el = state.value;
  }
  if (state.token(-1) !== preToken) {
    elements.push(el);
  }
  state.value = elements;
}

function parseIdentifier(state) {
  const token = state.token();
  state.value = {
    type: "Identifier",
    line: token.line,
    col: token.col,
    start: token.start,
    end: token.end,
    name: token.value
  };
  state.i++;
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
        parseIdentifier(state);
        left = state.value;
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
        if (!state.value) {
          state.i--;
        } else {
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
      }
      
      if (token.value === "(") {
        state.i++;
        parseExpression(state);
        const endToken = state.token();
        if (!endToken || endToken.value !== ")") {
          throw new ParseError(state);
        }
        left = {
          type: "GroupExpression",
          line: token.line,
          col: token.col,
          start: token.start,
          end: endToken.end,
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
      
      if (token.value === "[") {
        parseArray(state);
        left = state.value;
        continue;
      }
    } else {
      if (token.value === ".") {
        const nextToken = state.token(1);
        if (nextToken && nextToken.type === "word" && nextToken.start === token.end) {
          state.i++;
          parseIdentifier(state);
          left = {
            type: "MemberExpression",
            object: left,
            property: state.value,
            computed: false,
            start: left.start,
            end: nextToken.end,
            line: left.line,
            col: left.col
          };
          continue;
        }
      }
      
      if (token.value === "[") {
        state.i++;
        parseExpression(state);
        const endToken = state.token();
        if (!state.value || !endToken || endToken.value !== "]") {
          throw new ParseError(state);
        }
        left = {
          type: "MemberExpression",
          object: left,
          property: state.value,
          computed: true,
          start: left.start,
          end: endToken.end,
          line: left.line,
          col: left.col
        };
        state.i++;
        continue;
      }
      
      if (OP2_PRECEDENCE.hasOwnProperty(lowerCaseValue) && (
        OP2_PRECEDENCE[lowerCaseValue] > precedenceFloor ||
        OP2_PRECEDENCE[lowerCaseValue] == precedenceFloor && isRHOp(token)
      )) {
        state.i++;
        parseExpression(state, OP2_PRECEDENCE[lowerCaseValue]);
        if (!state.value) {
          state.i--;
        } else {
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
      
      // call expression
      if (token.value === "(" && token.start === state.token(-1).end) {
        state.i++;
        parseCommaList(state);
        const endToken = state.token();
        if (!endToken || endToken.value !== ")") {
          throw new ParseError(state);
        }
        left = {
          type: "CallExpression",
          callee: left,
          arguments: state.value,
          start: left.start,
          end: endToken.end,
          line: left.line,
          col: left.col
        };
        state.i++;
        continue;
      }
      
      // conditional
      if (token.value === "?") {
        state.i++;
        parseExpression(state);
        const consequent = state.value;
        const midToken = state.token();
        if (!consequent || !midToken || midToken.value !== ":") {
          throw new ParseError(state);
        }
        state.i++;
        parseExpression(state, OP3_PRECEDENCE[":"]);
        const alternate = state.value;
        if (!alternate) {
          throw new ParseError(state);
        }
        left = {
          type: "ConditionalExpression",
          test: left,
          consequent,
          alternate,
          start: left.start,
          end: alternate.end,
          line: left.line,
          col: left.col
        };
        continue;
      }
      
      // implicit concat expression
      if (OP2_PRECEDENCE["."] > precedenceFloor) {
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

function parseArray(state) {
  const token = state.token();
  state.i++;
  parseCommaList(state);
  const endToken = state.token();
  if (!endToken || endToken.value !== "]") {
    throw new ParseError(state);
  }
  state.value = {
    type: "ArrayExpression",
    elements: state.value,
    start: token.start,
    end: endToken.end,
    line: token.line,
    col: token.col
  };
  state.i++;
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
  while (!state.eof()) {
    if (state.tryCollectJoiner()) {
      continue;
    }
    const token = state.token();
    const lastToken = state.token(-1);
    if (token.value === "}" && lastToken.value !== ",") {
      break;
    }
    if (lastToken.value === "," || lastToken.value === "{") {
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
      continue;
    }
    if (token.value === "," && lastToken.value !== "{" && lastToken.value !== ",") {
      state.i++;
      continue;
    }
    throw new ParseError(state);
  }
  state.value = properties;
}

module.exports = {
  parseExpressionStatement
};

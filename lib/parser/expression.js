module.exports = {
  parseExpressionStatement,
  parseExpression,
  isOp,
  isAssignment
};

const {ParseError, unescapeString, tokenToId} = require("./util");
const {parseBlockStatement} = require("./block");
const {parseLegacyLiteral} = require("./command");

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

function isPostfixUnary(token) {
  return token.value === "++" || token.value === "--";
}

function parseExpressionStatement(state) {
  const parsers = [
    parseLegacyAssignmentExpression,
    parseExpression
  ];
  for (const parser of parsers) {
    parser(state);
    if (state.value) {
      if (!state.eof() && !state.sol()) {
        throw new ParseError(state);
      }
      break;
    }
  }
}

function parseLegacyAssignmentExpression(state) {
  const startIndex = state.i;
  state.value = null;
  const left = state.token();
  if (!left || left.type !== "word") {
    return;
  }
  state.i++;
  const op = state.token();
  if (!op || op.sol || op.value !== "=") {
    state.i = startIndex;
    return;
  }
  state.i++;
  let right = null;
  if (!state.sol() || state.token().joiner || isOp(state.token().value)) {
    parseLegacyLiteral(state);
    right = state.value;
  }
  state.value = {
    type: "LegacyAssignmentExpression",
    left: tokenToId(left),
    right,
    start: left.start,
    end: state.token(-1).end,
    line: left.line,
    col: left.col
  };
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

function expandAssignmentPattern(node) {
  if (node.type === "Identifier") {
    return node;
  }
  if (node.type === "BinaryExpression" && node.operator === ":=") {
    return {
      type: "AssignmentPattern",
      left: node.left,
      right: node.right,
      start: node.start,
      end: node.end,
      line: node.line,
      col: node.col
    };
  }
}

function argumentsToParams(state, args) {
  return args.map(node => {
    let result = expandAssignmentPattern(node);
    if (result) {
      return result;
    }
    if (
      node.type === "ImplicitConcatExpression" &&
      node.left.type === "Identifier" &&
      node.left.name.toLowerCase() === "byref"
    ) {
      const argument = expandAssignmentPattern(node.right);
      if (!argument) {
        throw new ParseError(state, node.right);
      }
      return {
        type: "ByRefExpression",
        argument,
        start: node.start,
        end: node.end,
        line: node.line,
        col: node.col
      };
    }
    if (node.type === "VariadicExpression") {
      const argument = expandAssignmentPattern(node.argument);
      if (!argument) {
        throw new ParseError(state, node.argument);
      }
      node.argument = argument;
      return node;
    }
    // console.log(node);
    throw new ParseError(state, node);
  });
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
        // identifier
        left = tokenToId(token);
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
        if (!state.value) {
          state.i--;
        } else {
          left = {
            type: "UnaryExpression",
            operator: token.value,
            prefix: true,
            argument: state.value,
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
          argument: state.value
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
          const property = tokenToId(nextToken);
          left = {
            type: "MemberExpression",
            object: left,
            property,
            computed: false,
            start: left.start,
            end: nextToken.end,
            line: left.line,
            col: left.col
          };
          state.i += 2;
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
            operator: token.value,
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
      
      if (isPostfixUnary(token)) {
        left = {
          type: "UnaryExpression",
          prefix: false,
          operator: token.value,
          argument: left,
          line: left.line,
          col: left.col,
          start: left.start,
          end: token.end
        };
        state.i++;
        continue;
      }
      
      // call expression or function definition
      if (token.value === "(" && token.start === state.token(-1).end) {
        const preToken = state.token(-1);
        state.i++;
        parseCommaList(state);
        const arguments = state.value;
        const endToken = state.token();
        if (!endToken || endToken.value !== ")") {
          throw new ParseError(state);
        }
        state.i++;
        let body;
        if (preToken.start === left.start && preToken.type === "word" && preToken.sol) {
          // maybe function declaration?
          parseBlockStatement(state);
          body = state.value;
        }
        // console.log(state.token());
        if (!body) {
          left = {
            type: "CallExpression",
            callee: left,
            arguments,
            start: left.start,
            end: endToken.end,
            line: left.line,
            col: left.col
          };
          continue;
        }
        left = {
          type: "FunctionDeclaration",
          id: left,
          params: argumentsToParams(state, arguments),
          body,
          start: left.start,
          end: body.end,
          line: left.line,
          col: left.col
        };
        break;
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
      if (
        OP2_PRECEDENCE["."] > precedenceFloor &&
        // never concat object?
        token.value !== "{"
      ) {
        parseExpression(state, OP2_PRECEDENCE["."]);
        if (!state.value) {
          // right hand is not a valid expression, expression end
          break;
        }
        left = {
          type: "ImplicitConcatExpression",
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

function isOp(op) {
  return [OP1_PRECEDENCE, OP2_PRECEDENCE, OP3_PRECEDENCE].some(table => table.hasOwnProperty(op));
}

function isAssignment(value) {
  return OP2_PRECEDENCE[value] === 1 || value === "=";
}

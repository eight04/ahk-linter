const {parseScript} = require("./block");
const {isOp} = require("./expression");

function getJoinerOpen(i, tokens, code) {
  const token = tokens[i];
  if (!token.sol || token.value !== "(") {
    return;
  }
  i++;
  let join = false;
  let sep;
  let trimLeft = false;
  let trimRight = true;
  let trimComment = false;
  let literalPercent = false;
  let literalComma = true;
  let literalAccent = false;
  while (i < tokens.length && tokens[i].line === token.line) {
    if (tokens[i].value === ")") {
      return;
    } else if (/^join/i.test(tokens[i].value)) {
      join = true;
      const re = /\S*/y;
      re.lastIndex = tokens[i].start + 4;
      const match = re.exec(code);
      sep = match[0];
      while (i + 1 < tokens.length && tokens[i + 1].start < re.lastIndex) {
        i++;
      }
    } else if (/^ltrim$/i.test(tokens[i].value)) {
      trimLeft = true;
    } else if (/^rtrim0$/i.test(tokens[i].value)) {
      trimRight = false;
    } else if (/^(comments|comment|com|c)$/.test(tokens[i].value)) {
      trimComment = true;
    } else if (tokens[i].value === "%") {
      literalPercent = true;
    } else if (tokens[i].value === ",") {
      literalComma = false;
    } else if (tokens[i].value === "`") {
      literalAccent = true;
    }
    i++;
  }
  return {
    join,
    sep,
    trimLeft,
    trimRight,
    trimComment,
    literalPercent,
    literalComma,
    literalAccent,
    lastIndex: i,
    startToken: token,
    endToken: null
  };
}

function createState(code) {
  const allTokens = [...tokenize(code)];
  const tokens = [];
  const comments = [];
  const joiners = [];
  let joiner;
  let commentOpen;
  let mlComment;
  let i = 0;
  while (i < allTokens.length) {
    const token = allTokens[i];
    if (commentOpen) {
      mlComment.push(token);
      if (token.value === "*/" && token.sol) {
        comments.push({
          type: "MultiLineComment",
          start: mlComment[0].start,
          end: mlComment[mlComment.length - 1].end,
          line: mlComment[0].line,
          col: mlComment[0].col
        });
        commentOpen = mlComment = null;
      }
      i++;
    } else if (token.value === ";" && (!joiner || joiner.trimComment)) {
      const s = [];
      while (i < allTokens.length && allTokens[i].line === token.line) {
        s.push(allTokens[i]);
        i++;
      }
      comments.push({
        type: "SingleLineComment",
        start: s[0].start,
        end: s[s.length - 1].end,
        line: s[0].line,
        col: s[0].col
      });
    } else if (token.value === "/*" && token.sol && !joiner) {
      commentOpen = token;
      mlComment = [token];
      i++;
    } else if (!joiner && (joiner = getJoinerOpen(i, allTokens, code))) {
      i = joiner.lastIndex;
    } else if (joiner && token.sol) {
      if (token.value === ")") {
        joiner.endToken = token;
        joiners.push(joiner);
        if (i + 1 < allTokens.length && allTokens[i + 1].line === token.line) {
          allTokens[i + 1].sol = true;
          allTokens[i + 1].joiner = joiner;
        }
      } else {
        token.joiner = joiner;
        tokens.push(token);
      }
      i++;
    } else {
      tokens.push(token);
      i++;
    }
  }
  
  return {
    comments,
    joiners,
    code,
    tokens,
    token(offset = 0) {
      return this.eof(offset) ? null : this.tokens[this.i + offset];
    },
    eof(offset = 0) {
      return this.i + offset >= this.tokens.length || this.i + offset < 0;
    },
    sol() {
      const token = this.token();
      return token && token.sol;
    },
    eol() {
      const nextToken = this.token(1);
      return !nextToken || nextToken.sol;
    },
    continueLine() {
      const token = this.token();
      return token && (!token.sol || token.joiner || isOp(token.value));
    },
    matchToken(...values) {
      for (let i = 0; i < values.length; i++) {
        const token = this.token(i);
        if (!token || token.value.toLowerCase() !== values[i]) {
          return false;
        }
      }
      return true;
    },
    i: 0,
    value: null
  };
}

function parse(code) {
  const state = createState(code);
  parseScript(state);
  return state.value;
}

function * tokenize(code) {
  const re = /(\r\n|\n|\r)|([^\S\r\n]+)|(0x[0-9a-f]+|\d+(?:\.\d+)?)|\b(true|false)\b|(\w+)|(\bnew\b|\/\/=|>>=|<<=|\+\+|--|\*\*|\/\/|<<|>>|~=|<=|>=|==|<>|!=|not|and|&&|or|\|\||:=|\+=|-=|\*=|\/=|\.=|\|=|&=|^=|\/\*|\*\/)|("(?:[^"\r\n]|"")*")|(\S)/imy;
  const types = [
    "newline", "whitespace", "number", "boolean", "word",
    "symbol" /* multichar symbol? */, "string", "symbol"
  ];
  let match;
  let line = 0;
  let col = 0;
  let sol = true;
  while ((match = re.exec(code))) {
    const type = getType(match);
    if (type === "newline") {
      line++;
      col = 0;
      sol = true;
    } else {
      if (type === "whitespace") {
        // pass
      } else {
        yield token(type);
        sol = false;
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
      end: re.lastIndex,
      sol,
      joiner: null
    };
  }
}

module.exports = {parse};

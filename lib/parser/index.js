const {parseExpressionStatement} = require("./expression");
const {parseFlowStatement} = require("./flow");
const {parseCommandStatement} = require("./command");
const {ParseError} = require("./util");

function createState(code) {
  return {
    comments: [],
    joinerOpen: null,
    joiners: [],
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
    tryCollectJoiner() {
      if (this.joinerOpen) {
        return this.tryCollectJoinerClose();
      }
      const params = [];
      if (!this.sol() || this.token().value !== "(") {
        return false;
      }
      const start = this.i;
      while (!this.eol()) {
        params.push(this.token());
        this.i++;
      }
      params.push(this.token());
      if (params.some(t => t.value === ")")) {
        this.i = start;
        return false;
      }
      this.tokens.splice(start, params.length);
      this.i = start;
      this.joinerOpen = params;
      return true;
    },
    tryCollectJoinerClose() {
      if (!this.sol() || this.token().value !== ")") {
        return false;
      }
      this.joiners.push({
        open: this.joinerOpen[0],
        close: this.token(),
        params: this.joinerOpen.slice(1)
      });
      this.joinerOpen = null;
      this.tokens.splice(this.i, 1);
      return true;
    },
    eof(offset = 0) {
      return this.i + offset >= this.tokens.length || this.i + offset < 0;
    },
    sol() {
      const lastToken = this.token(-1);
      const token = this.token();
      return !lastToken || lastToken.line !== token.line;
    },
    eol() {
      const nextToken = this.token(1);
      const token = this.token();
      return !nextToken || nextToken.line !== token.line;
    },
    continueLine() {
      if (!this.sol()) {
        return true;
      }
      const token = this.token();
      if (token.type === "symbol") {
        return true;
      }
      if (this.joinerOpen) {
        return true;
      }
      if (this.joiners.length) {
        // FIXME: is it sufficient to only check the last joiner?
        const joiner = this.joiners[this.joiners.length - 1];
        return token.line >= joiner.open.line && token.line <= joiner.close.line;
      }
      return false;
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
  const parsers = [
    parseFlowStatement,
    parseCommandStatement,
    parseExpressionStatement
  ];
  while (!state.eof()) {
    if (state.tryCollectComment()) {
      continue;
    }
    if (!state.sol()) {
      throw new ParseError(state);
    }
    for (const parser of parsers) {
      parser(state);
      if (state.value) {
        break;
      }
    }
    if (state.value) {
      body.push(state.value);
      continue;
    }
    throw new ParseError(state);
  }
  state.value = {
    type: "Body",
    body
  };
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

module.exports = {parse};

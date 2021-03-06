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

function unescapeString(text) {
  return text.replace(/`.|""/g, t => {
    return UNESCAPE_TABLE[t] || t.slice(1);
  });
}

class ParseError extends Error {
  constructor(state, node = null) {
    const token = node ?
      state.tokens.find(t => t.start >= node.start) :
      state.token();
    super(token ? `Unexpected token: ${token.value}` : `Unexpected EOF`);
    this.type = "ParseError";
    if (token) {
      this.line = token.line;
      this.col = token.col;
      this.index = token.start;
      this.start = token.start;
      this.end = token.end;
    } else {
      const lastToken = state.token(-1);
      this.line = lastToken.line;
      this.col = lastToken.col + lastToken.value.length;
      this.index = lastToken.end;
      this.start = lastToken.end;
      this.end = lastToken.end;
    }
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

function tokenToId(token) {
  return {
    type: "Identifier",
    line: token.line,
    col: token.col,
    start: token.start,
    end: token.end,
    name: token.value
  };
}

module.exports = {
  unescapeString,
  ParseError,
  tokenToId
};

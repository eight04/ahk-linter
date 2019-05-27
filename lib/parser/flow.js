function parseFlowStatement(state) {
  const token = state.token();
  const parsers = {
    for: parseForStatement,
    if: parseIfStatement,
    loop: parseLoopStatement,
    try: parseTryStatement,
    while: parseWhileStatement
  };
  const type = token.value.toLowerCase();
  if (parsers.hasOwnProperty(type)) {
    parsers[type](state);
  } else {
    state.value = null;
  }
}

function parseForStatement(state) {
  const token = state.token();
  state.i++;
  const key = state.token();
  if (!key || key.type !== "word") {
    
  }
}

function parseIfStatement() {}

function parseLoopStatement() {
  
}

function parseTryStatement() {}

function parseWhileStatement() {}

module.exports = {
  parseFlowStatement
};

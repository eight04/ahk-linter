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

module.exports = {
  parseFlowStatement
};

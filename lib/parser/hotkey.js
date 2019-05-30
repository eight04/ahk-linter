module.exports = {
  parseHotkeyStatement,
  parseHotstringStatement
};

const {parseStatement} = require("./block");
const {tokensToLegacyLiteral, parseLegacyLiteral} = require("./command");
const {tokenToId, ParseError} = require("./util");

// https://www.autohotkey.com/docs/KeyList.htm
const VALID_KEYS = new Set([
  // general buttons
  "LButton", "RButton", "MButton",
  // advanced buttons
  "XButton1", "XButton2",
  // wheel
  "WheelDown", "WheelUp", "WheelLeft", "WheelRight",
  // general keys
  "CapsLock", "Space", "Tab", "Enter", "Return", "Escape", "Esc", "Backspace",
  "BS",
  // cursor control keys
  "ScrollLock", "Delete", "Del", "Insert", "Ins", "Home", "End", "PgUp", "PgDn",
  "Up", "Down", "Left", "Right",
  // numpad
  "NumpadIns", "NumpadEnd", "NumpadDown", "NumpadPgDn", "NumpadLeft",
  "NumpadClear", "NumpadRight", "NumpadHome", "NumpadUp", "NumpadPgUp",
  "NumpadDot", "NumpadDel", "NumLock", "NumpadDiv", "NumpadMult", "NumpadAdd",
  "NumpadSub", "NumpadEnter",
  // modifier
  "LWin", "RWin", "Control", "Ctrl", "Alt", "Shift", "LControl", "LCtrl",
  "RControl", "RCtrl", "LShift", "RShift", "LAlt", "RAlt",
  // multimedia
  "Browser_Back", "Browser_Forward", "Browser_Refresh", "Browser_Stop",
  "Browser_Search", "Browser_Favorites", "Browser_Home", "Volume_Mute", 
  "Volume_Down", "Volume_Up", "Media_Next", "Media_Prev", "Media_Stop", 
  "Media_Play_Pause", "Launch_Mail", "Launch_Media", "Launch_App1",
  "Launch_App2",
  // other
  "AppsKey", "PrintScreen", "CtrlBreak", "Pause", "Break", "Help", "Sleep"
].map(k => k.toLowerCase()));

function parseKeyCombination(state) {
  const startIndex = state.i;
  const keys = [];
  let needAmpersand = false;
  while (keys.length < 2 && !state.eof() && (state.i === startIndex || !state.sol())) {
    const token = state.token();
    const nextToken = state.token(1);
    
    // debugger;
    if (needAmpersand) {
      if (token.value === "&") {
        needAmpersand = false;
        state.i++;
        continue;
      }
      break;
    }

    // second joy key
    if (
      token.type === "number" &&
      nextToken &&
      nextToken.start === token.end &&
      isValidKey(token.value + nextToken.value)
    ) {
      keys.push({
        type: "Identifier",
        name: token.value + nextToken.value,
        start: token.start,
        end: nextToken.end,
        line: token.line,
        col: token.col
      });
      state.i += 2;
      needAmpersand = true;
      continue;
    }
    
    if (isValidKey(token.value)) {
      if (nextToken && nextToken.value.toLowerCase() === "up") {
        keys.push({
          type: "KeyUpExpression",
          argument: tokenToId(token),
          start: token.start,
          end: nextToken.end,
          line: token.line,
          col: token.col
        });
        state.i += 2;
        needAmpersand = true;
      } else {
        keys.push(tokenToId(token));
        state.i++;
        needAmpersand = true;
      }
      continue;
    }
    
    break;
  }
  state.value = keys;
}

function isValidKey(key) {
  if (key.length === 1) {
    // FIXME: is this true?
    return true;
  }
  let match;
  if ((match = key.match(/^(\d{1,2})joy/i)) && Number(match[1]) <= 16) {
    key = key.slice(match[1].length);
  }
  if (VALID_KEYS.has(key.toLowerCase())) {
    return true;
  }
  if ((match = key.match(/^f(\d{1,2})$/i)) && Number(match[1]) <= 24) {
    return true;
  }
  if ((match = key.match(/^joy(\d{1,2})/)) && Number(match[1] <= 32)) {
    return true;
  }
  return /^numpad\d$/i.test(key) || /^sc[\da-f]{3}$/i.test(key) ||
    /^vk[\da-f]{2}$/i.test(key);
}

function isModifier(value) {
  return /^[#!^+<>*~$]$/.test(value);
}

function isDoubleColon(state, offset = 0) {
  const token = state.token(offset);
  const nextToken = state.token(offset + 1);
  return token && nextToken &&
    token.value === ":" && nextToken.value === ":" &&
    token.end === nextToken.start;    
}

function parseHotkeyStatement(state) {
  const startIndex = state.i;
  const startToken = state.token();
  const modifiers = [];
  let lastEnd = startIndex;
  while (!state.eof() && (state.i === startIndex || !state.sol())) {
    const token = state.token();
    if (lastEnd !== token.start || !isModifier(token.value)) {
      break;
    }
    modifiers.push(token);
    state.i++;
    lastEnd = token.end;
  }
  if (state.eof() || modifiers.length && state.sol()) {
    state.value = null;
    state.i = startIndex;
    return;
  }
  let key = null;
  let prefixKey = null;
  if (isDoubleColon(state) && modifiers.length) {
    // !::return
    key = tokenToId(modifiers.pop());
  } else if (isDoubleColon(state, 1) && state.token().value.length === 1) {
    // :::return
    // single char key
    key = tokenToId(state.token());
    state.i++;
  } else {
    parseKeyCombination(state);
    const keys = state.value;
    if (!keys.length || !isDoubleColon(state)) {
      state.i = startIndex;
      state.value = null;
      return;
    }
    if (keys.length > 1) {
      prefixKey = keys[0];
      key = keys[1];
    } else {
      key = keys[0];
    }
  }
  state.i += 2;
  let command = null;
  if (!state.eof() && !state.sol()) {
    parseStatement(state);
    command = state.value;
  }
  if (!state.eof() && !state.sol()) {
    throw new ParseError(state);
  }
  state.value = {
    type: "HotkeyStatement",
    modifier: tokensToLegacyLiteral(modifiers),
    prefixKey,
    key,
    execute: command,
    start: startToken.start,
    end: state.token(-1).end,
    line: startToken.line,
    col: startToken.col
  };
}

function parseHotstringStatement(state) {
  const startToken = state.token();
  const startIndex = state.i;
  if (startToken.value !== ":") {
    state.value = null;
    return;
  }
  state.i++;
  const options = [];
  while (!state.eof() && !state.sol()) {
    const token = state.token();
    const newOptions = parseOption(token.value);
    if (!newOptions) {
      break;
    }
    options.push(...newOptions);
    state.i++;
  }
  if (state.token().value !== ":") {
    state.value = null;
    state.i = startIndex;
    return;
  }
  state.i++;
  const hotstring = [];
  let validString = false;
  let escape = false;
  while (!state.eof() && !state.sol()) {
    const token = state.token();
    
    if (escape && state.token().start === state.token(-1).end) {
      escape = false;
      hotstring.push(state.token());
      state.i++;
      continue;
    }
    
    if (isDoubleColon(state)) {
      validString = true;
      break;
    }
    
    if (token.value === "`") {
      escape = true;
    }
    hotstring.push(token);
    state.i++;
  }
  if (!validString || !hotstring.length) {
    state.i = startIndex;
    state.value = null;
    return;
  }
  state.i += 2;
  let command = null;
  let replacement = null;
  if (state.continueLine()) {
    if (options.some(o => o === "x" || o === "X")) {
      parseStatement(state);
      command = state.value;
    } else {
      parseLegacyLiteral(state);
      replacement = state.value;
    }
  }
  if (!state.eof() && !state.sol()) {
    throw new ParseError(state);
  }
  state.value = {
    type: "HotstringStatement",
    options,
    hotstring: tokensToLegacyLiteral(hotstring),
    execute: command,
    replacement,
    start: startToken.start,
    end: state.token(-1).end,
    line: startToken.line,
    col: startToken.col
  };
  
  function parseOption(text) {
    const re = /\*|\?|B0|B|C0|C1|C|k-1|k\d+|O0|O|P\d+|R0|R|SI|SP|SE|T0|T|X|Z0|Z/iy;
    const s = [];
    let match;
    while ((match = re.exec(text))) {
      s.push(match[0]);
      if (re.lastIndex === text.length) {
        return s;
      }
    }
    return null;
  }
}

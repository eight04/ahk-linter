AHK Linter
==========

Linter for AHK (Autohotkey).

> **NOTE**: This is a work in progress. It is not yet ready for use.

> **NOTE**: The development of this project is currently on hold. If you just need a syntax checker in the editor, try [vscode-ahk2-lsp](https://github.com/thqby/vscode-autohotkey2-lsp).

Installation
------------

```
npm install ahk-linter
```

Usage
-----

```
const ahkLinter = require("ahk-linter");
ahkLinter.lint(`
MsgBox, Hello World!
`)
  .then(warnings => {
    for (const warn of warnings) {
      console.log(warn.line, warn.col, warn.code, warn.text, warn.severity);
    }
  });
```

node.line/node.col is used to calculated continuation lines.

Changelog
---------

* 0.1.0 (Next)

  - First release.

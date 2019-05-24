AHK Linter
==========

Linter for AHK (Autohotkey).

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

Changelog
---------

* 0.1.0 (Next)

  - First release.

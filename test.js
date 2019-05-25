const fs = require("fs");
const {parse} = require(".");

const code = fs.readFileSync(String.raw`D:\Dev\AHK-Timer\Timer.ahk`, "utf8");
console.log(parse(code));

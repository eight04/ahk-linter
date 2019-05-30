/* eslint no-console: 0 */
const fs = require("fs").promises;
const path = require("path");
const {promisify} = require("util");

const {run} = require("neodoc");
const glob = promisify(require("glob"));
const chalk = require("chalk");

const {lint} = require("./index");

(async () => {
  const args = run(`
  usage: ahklint <file>...

  options:
    <file>  Files to lint. If the file doesn't exist, the program will parse the
            argument as a glob pattern.
  `, {laxPlacement: true});
  
  const profile = createProfile();
  for (const file of args["<file>"]) {
    let code;
    try {
      code = await fs.readFile(file);
    } catch (err) {
      const files = await glob(file);
      for (const file of files) {
        const code = await fs.readFile(file);
        profile.add(path.resolve(file), code);
      }
      continue;
    }
    profile.add(path.resolve(file), code);
  }
  profile.exitWithError();
})();

function createProfile() {
  let errorCount = 0;
  let fileCount = 0;
  let errorFileCount = 0;
  return {add, exitWithError};
  
  function add(file, code) {
    fileCount++;
    const result = lint({code, throwParseError: false});
    if (!result.length) {
      return;
    }
    console.log(`${fileCount ? "\n" : ""}${file}`);
    const maxMessageWidth = result.reduce(
      (len, r) => Math.max(len, r.message.length),
      0
    );
    for (const r of result) {
      console.log(`${String(r.line + 1).padStart(4, " ")}:${String(r.col + 1).padEnd(3, " ")}${r.message.padEnd(maxMessageWidth + 1, " ")}${r.code}`);
    }
    errorFileCount++;
    errorCount += result.length;
  }
  
  function exitWithError() {
    if (!fileCount) {
      console.log(chalk.red("please specify a file"));
    } else if (errorCount) {
      console.log(chalk.red(`\nfound ${errorCount} error(s) in ${errorFileCount} files`));
    } else {
      console.log(chalk.green("processed ${fileCount} files, no error found"));
    }
    process.exit(errorCount ? 1 : 0);
  }
}

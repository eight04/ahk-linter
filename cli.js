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
      code = await fs.readFile(file, "utf8");
    } catch (err) {
      const files = await glob(file);
      for (const file of files) {
        const stat = await fs.stat(file);
        if (stat.isDirectory()) {
          continue;
        }
        const code = await fs.readFile(file, "utf8");
        profile.add(path.resolve(file), code);
      }
      continue;
    }
    profile.add(path.resolve(file), code);
  }
  profile.exitWithError();
})()
  .catch(console.error);

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
    const maxCodeWidth = result.reduce(
      (len, r) => Math.max(len, r.code.length),
      0
    );
    for (const r of result) {
      console.log(`${String(r.line + 1).padStart(4, " ")}:${String(r.col + 1).padEnd(2, " ")} ${r.message}  (${r.code.padEnd(maxCodeWidth, " ")})`);
    }
    errorFileCount++;
    errorCount += result.length;
  }
  
  function exitWithError() {
    if (!fileCount) {
      console.log(chalk.red("please specify a file"));
    } else if (errorCount) {
      console.log(chalk.red(`\nfound ${plural(errorCount, "error")} in ${plural(errorFileCount, "file")}`));
    } else {
      console.log(chalk.green(`processed ${plural(fileCount, "file")}, no error found`));
    }
    process.exit(errorCount ? 1 : 0);
  }
  
  function plural(i, t) {
    return `${i} ${t}${i > 1 ? "s" : ""}`;
  }
}

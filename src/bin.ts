#!/usr/bin/env node
import { run } from "./cli.js";

const result = await run(process.argv.slice(2), { color: process.stdout.isTTY && !process.env.NO_COLOR });
if (result.stdout) console.log(result.stdout);
if (result.stderr) console.error(result.stderr);
process.exitCode = result.code;

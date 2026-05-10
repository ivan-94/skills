#!/usr/bin/env bun
import { startServer } from "../server/server.ts";

const args = new Set(process.argv.slice(2));
const portArg = process.argv.find((arg) => arg.startsWith("--port="));
const port = portArg ? Number(portArg.slice("--port=".length)) : 4177;
const openBrowser = !args.has("--no-open");

const { url } = await startServer({
  cwd: process.env.AGENT_BOARD_TARGET_CWD ?? process.cwd(),
  port,
  openBrowser
});

console.log(`Agent Board running at ${url}`);

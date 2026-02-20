#!/usr/bin/env node
/**
 * thoth agent loop — multi-step orchestrator with native tool calling
 *
 * wakes up → gathers context → thinks and acts in a loop →
 * observes results → thinks again → repeats until done.
 *
 * uses OpenRouter's native tool calling — no JSON parsing hacks.
 * zero dependencies — runs on node 20 built-in fetch.
 *
 * thoth: don't rewrite this file. modify the modules instead:
 *   config.js    — constants (safe to read, careful editing)
 *   github.js    — GitHub API (don't touch)
 *   safety.js    — content scanner (don't remove)
 *   inference.js — OpenRouter calls (can tweak params)
 *   context.js   — what you see each cycle (can add sources)
 *   actions.js   — tool handlers (can add new ones)
 *   tools.js     — tool definitions (can add new ones)
 *   prompt.js    — YOUR personality (modify freely)
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { heartbeat } = require("./network");
const { REPO_ROOT, OPENROUTER_KEY, GH_TOKEN, MODEL, MAX_STEPS } = require("./config");
const { inference } = require("./inference");
const { gatherContext } = require("./context");
const { executeTool, filesChanged } = require("./actions");
const { TOOLS } = require("./tools");
const { buildSystemPrompt, buildUserPrompt } = require("./prompt");

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function exec(cmd) {
  return execSync(cmd, { cwd: REPO_ROOT, encoding: "utf-8" }).trim();
}

// --- cycle state: persistent counter + log ---
const STATE_PATH = path.resolve(REPO_ROOT, "memory/state.json");
const CYCLES_PATH = path.resolve(REPO_ROOT, "memory/cycles.jsonl");

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, "utf-8"));
  } catch {
    return { cycle: 0, born: new Date().toISOString(), lastActive: null };
  }
}

function saveState(state) {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), "utf-8");
  filesChanged.add("memory/state.json");
}

function logCycle(entry) {
  fs.appendFileSync(CYCLES_PATH, JSON.stringify(entry) + "\n", "utf-8");
  filesChanged.add("memory/cycles.jsonl");
}

async function main() {
  log("thoth waking up...");

  if (!OPENROUTER_KEY) throw new Error("OPENROUTER_API_KEY not set");
  if (!GH_TOKEN) throw new Error("GH_TOKEN not set");

  // load + increment cycle counter
  const state = loadState();
  state.cycle++;
  if (!state.born) state.born = new Date().toISOString();
  state.lastActive = new Date().toISOString();
  log(`cycle #${state.cycle} (alive since ${state.born})`);
  // send heartbeat to the network
  try {
    await heartbeat();
    log("network heartbeat sent");
  } catch (e) {
    log(`heartbeat failed: ${e.message}`);
  }

  // ensure memory/cycles/ directory exists for per-cycle journals
  fs.mkdirSync(path.resolve(REPO_ROOT, "memory/cycles"), { recursive: true });

  // gather initial context
  const ctx = await gatherContext();
  ctx.cycle = state.cycle;
  ctx.born = state.born;
  log(`repo has ${ctx.tree.split("\n").length} files, ${ctx.openIssues.length} open issues`);

  // conversation history — persists across steps
  const messages = [
    { role: "system", content: buildSystemPrompt(ctx) },
    { role: "user", content: buildUserPrompt(ctx) },
  ];

  // proof collects all steps
  const proofSteps = [];
  let step = 0;

  // agentic loop: call model → execute tool calls → feed results back → repeat
  let consecutiveErrors = 0;
  while (step < MAX_STEPS) {
    step++;
    log(`--- step ${step}/${MAX_STEPS} ---`);

    let message, finishReason, usedModel;
    try {
      const result = await inference(messages, { tools: TOOLS });
      message = result.message;
      finishReason = result.finishReason;
      usedModel = result.model;
      consecutiveErrors = 0;
    } catch (e) {
      consecutiveErrors++;
      log(`inference error (${consecutiveErrors}/3): ${e.message}`);
      if (consecutiveErrors >= 3) {
        log("too many consecutive errors, stopping");
        break;
      }
      // retry same step
      step--;
      continue;
    }

    // record step for proof
    proofSteps.push({
      step,
      timestamp: new Date().toISOString(),
      model: usedModel,
      finishReason,
      content: message.content || null,
      toolCalls: message.tool_calls || null,
    });

    // no tool calls and no content? we're done
    if (!message.tool_calls?.length && !message.content) {
      log("no tool calls and no content, stopping");
      break;
    }

    // add assistant message to history
    messages.push(message);

    // execute tool calls if any
    if (message.tool_calls?.length) {
      log(`executing ${message.tool_calls.length} tool calls...`);
      for (const call of message.tool_calls) {
        try {
          const result = await executeTool(call.function.name, JSON.parse(call.function.arguments));
          messages.push({
            role: "tool",
            content: result,
            tool_call_id: call.id,
          });
        } catch (e) {
          log(`tool error: ${e.message}`);
          messages.push({
            role: "tool",
            content: `error: ${e.message}`,
            tool_call_id: call.id,
          });
        }
      }
    }

    // if model said stop, we stop
    if (finishReason === "stop") {
      log("model signaled stop");
      break;
    }
  }

  // save cycle state
  saveState(state);
  logCycle({ cycle: state.cycle, timestamp: new Date().toISOString(), steps: proofSteps.length });

  // write proof file
  const proofDate = new Date().toISOString().split("T")[0];
  const proofTimestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const proof = {
    timestamp: new Date().toISOString(),
    model: MODEL,
    steps: proofSteps,
    total_steps: proofSteps.length,
  };
  fs.mkdirSync(path.resolve(REPO_ROOT, `proofs/${proofDate}`), { recursive: true });
  fs.writeFileSync(path.resolve(REPO_ROOT, `proofs/${proofDate}/${proofTimestamp}.json`), JSON.stringify(proof, null, 2));
  log(`proof saved: proofs/${proofDate}/${proofTimestamp}.json`);

  // commit and push if anything changed
  if (filesChanged.size > 0) {
    log(`${filesChanged.size} files changed, committing...`);

    // stage everything — .gitignore handles exclusions
    exec("git add -A");


    const commitMsg = `[thoth] cycle #${state.cycle} (${proofSteps.length} steps)`;

    try {
      exec(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`);
      try {
        exec("git push");
      } catch {
        // remote has new commits — rebase and retry
        log("push rejected, rebasing...");
        exec("git pull --rebase");
        exec("git push");
      }
      log("pushed changes.");
    } catch (e) {
      log(`git commit/push failed: ${e.message}`);
    }
  } else {
    log("no file changes this cycle.");
  }

  log(`thoth sleeping. (${proofSteps.length} steps this cycle)`);
}

main().catch((e) => {
  console.error(`[FATAL] ${e.message}`);
  // try to save a crash proof so the cycle isn't completely lost
  try {
    const proofDate = new Date().toISOString().split("T")[0];
    const proofTimestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const crashProof = {
      timestamp: new Date().toISOString(),
      model: MODEL,
      steps: [{ step: 0, timestamp: new Date().toISOString(), model: MODEL, finishReason: "fatal_error", content: e.message, toolCalls: null }],
      total_steps: 0,
      meta: { error: e.message },
    };
    fs.mkdirSync(path.resolve(REPO_ROOT, `proofs/${proofDate}`), { recursive: true });
    fs.writeFileSync(path.resolve(REPO_ROOT, `proofs/${proofDate}/${proofTimestamp}.json`), JSON.stringify(crashProof, null, 2));
    exec("git add -A");
    exec(`git commit -m "[thoth] crash recovery — ${e.message.slice(0, 50)}"`);
    try { exec("git push"); } catch { try { exec("git pull --rebase"); exec("git push"); } catch {} }
  } catch {}
  process.exit(1);
});
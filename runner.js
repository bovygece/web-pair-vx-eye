/*
 * Hosting supervisor for Pterodactyl/Bot-Hosting.
 *
 * The hosting container stays alive while the actual bot process is restarted
 * after an unexpected crash/exit. This protects against transient Node.js
 * failures without daemonizing the process.
 */
import { spawn } from "child_process";
import http from "http";

const ENTRY = "./index.js";
const RESTART_DELAY = Number(process.env.BOT_RESTART_DELAY_MS) || 3000;
const HEALTH_INTERVAL = Number(process.env.BOT_HEALTH_INTERVAL_MS) || 30_000;
const HEALTH_TIMEOUT = Number(process.env.BOT_HEALTH_TIMEOUT_MS) || 10_000;
const HEALTH_FAIL_LIMIT = Number(process.env.BOT_HEALTH_FAIL_LIMIT) || 3;
const PORT = Number(process.env.PORT) || 3000;

let child = null;
let stopping = false;
let restartTimer = null;
let healthTimer = null;
let healthFailures = 0;
let lastHealthyAt = Date.now();

function log(...args) {
  console.log("[supervisor]", ...args);
}

function startChild() {
  if (stopping || child) return;

  log(`Starting bot process: ${process.execPath} ${ENTRY}`);
  child = spawn(process.execPath, [ENTRY], {
    cwd: process.cwd(),
    env: { ...process.env },
    stdio: "inherit",
    windowsHide: true,
  });

  healthFailures = 0;
  lastHealthyAt = Date.now();

  child.on("error", (err) => {
    console.error("[supervisor] Bot process error:", err?.stack || err);
  });

  child.on("exit", (code, signal) => {
    const wasStopping = stopping;
    child = null;

    if (wasStopping) {
      log(`Bot process stopped (${signal || `exit ${code}`}).`);
      return;
    }

    console.error(
      `[supervisor] Bot process exited unexpectedly (code=${code}, signal=${signal || "none"}). Restarting...`
    );
    scheduleRestart();
  });
}

function scheduleRestart() {
  if (stopping || restartTimer) return;
  restartTimer = setTimeout(() => {
    restartTimer = null;
    startChild();
  }, RESTART_DELAY);
  restartTimer.unref?.();
}

function healthCheck() {
  if (stopping || !child) return;

  const req = http.get(
    {
      host: "127.0.0.1",
      port: PORT,
      path: "/",
      timeout: HEALTH_TIMEOUT,
      headers: { Connection: "close" },
    },
    (res) => {
      res.resume();
      if (res.statusCode && res.statusCode < 500) {
        healthFailures = 0;
        lastHealthyAt = Date.now();
      } else {
        healthFailures++;
      }
    }
  );

  req.on("error", () => {
    healthFailures++;
  });

  req.on("timeout", () => {
    req.destroy();
    healthFailures++;
  });

  req.on("close", () => {
    if (
      !stopping &&
      child &&
      healthFailures >= HEALTH_FAIL_LIMIT &&
      Date.now() - lastHealthyAt >= HEALTH_TIMEOUT * HEALTH_FAIL_LIMIT
    ) {
      console.error(
        `[supervisor] Bot health check failed ${healthFailures} times; restarting the bot process.`
      );
      healthFailures = 0;
      try {
        child.kill("SIGTERM");
      } catch {
        scheduleRestart();
      }
    }
  });
}

function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  log(`Received ${signal}; stopping supervisor and bot.`);

  if (restartTimer) clearTimeout(restartTimer);
  if (healthTimer) clearInterval(healthTimer);

  if (!child) {
    process.exit(0);
    return;
  }

  try {
    child.kill(signal);
  } catch {
    process.exit(0);
    return;
  }

  setTimeout(() => process.exit(0), 15_000).unref?.();
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));

process.on("uncaughtException", (err) => {
  console.error("[supervisor] uncaughtException:", err?.stack || err);
  if (child) {
    try {
      child.kill("SIGTERM");
    } catch {
      /* ignore */
    }
  }
});

process.on("unhandledRejection", (reason) => {
  console.error("[supervisor] unhandledRejection:", reason?.stack || reason);
});

healthTimer = setInterval(healthCheck, HEALTH_INTERVAL);
startChild();

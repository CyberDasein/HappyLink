#!/usr/bin/env node
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Load .env if present
try {
  require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
} catch (e) {
  // ignore
}

// Simple argv parser for --target and --branch
const argv = require('minimist')(process.argv.slice(2));
const target = argv.target || argv.t || process.env.TARGET_REPO_URL || '';
const branch = argv.branch || argv.b || process.env.TARGET_BRANCH || 'deploy';

// Build environment for the child process
const childEnv = Object.assign({}, process.env);
if (target) childEnv.TARGET_REPO_URL = target;
childEnv.TARGET_BRANCH = branch;

// Find deploy.sh
const deployScript = path.resolve(__dirname, '../deploy.sh');
if (!fs.existsSync(deployScript)) {
  console.error('deploy.sh not found at', deployScript);
  process.exit(1);
}

// Try to run with bash (common), else try sh
function runWithShell(shell) {
  return spawn(shell, [deployScript], { stdio: 'inherit', env: childEnv });
}

function tryRun() {
  let child;
  try {
    child = runWithShell('bash');
  } catch (e) {
    try {
      child = runWithShell('sh');
    } catch (err) {
      console.error('Failed to spawn shell to run deploy.sh. Ensure bash or sh is available.');
      process.exit(1);
    }
  }

  child.on('exit', (code) => process.exit(code));
  child.on('error', (err) => {
    console.error('deploy process error:', err && err.message ? err.message : err);
    process.exit(1);
  });
}

tryRun();

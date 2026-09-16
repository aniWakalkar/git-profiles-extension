const vscode = require('vscode');
const cp = require('child_process');
const { promisify } = require('util');
const { CONFIG_SECTION } = require('./config');
const { logCommand, formatGitCommand } = require('./commandLog');

const execFileAsync = promisify(cp.execFile);

function getWorkspaceRoot() {
  const folders = vscode.workspace.workspaceFolders;
  return folders && folders.length > 0 ? folders[0].uri.fsPath : undefined;
}

// `explanation`, when given, logs this call (terminal + history file) as a
// meaningful, user-facing action. Omit it for silent, read-only lookups
// (status polling, branch listing, diff content) that would just be noise.
// "Training Wheels": when enabled, every meaningful (explained) git command
// pauses for an explicit Yes/No before it actually runs, so a newer user can
// see exactly what a UI action is about to do. Silent read-only lookups
// (status polling, branch listing, diff content) skip this -- they have no
// `explanation` and would just be noise.
async function confirmTrainingWheels(command, explanation) {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  if (!config.get('trainingWheels')) return true;

  const choice = await vscode.window.showWarningMessage(
    `Custom Git Profiles wants to run:\n\n${command}\n\n${explanation}`,
    { modal: true },
    'Yes',
    'No'
  );
  return choice === 'Yes';
}

async function execGit(cwd, args, explanation) {
  if (explanation) {
    const command = formatGitCommand(args);
    const proceed = await confirmTrainingWheels(command, explanation);
    if (!proceed) {
      throw new Error('Cancelled -- you chose not to run this command.');
    }
    logCommand(command, explanation);
  }
  try {
    const { stdout } = await execFileAsync('git', args, { cwd });
    return stdout;
  } catch (err) {
    throw new Error((err.stderr || err.message || String(err)).trim());
  }
}

// Same confirm/log behavior as execGit, but returns { stdout, stderr }
// instead of just stdout -- for commands like `git pull` where the useful,
// human-readable summary (branch update info, "Already up to date.", etc)
// is worth showing back to the user, not just discarding.
async function execGitCapture(cwd, args, explanation) {
  if (explanation) {
    const command = formatGitCommand(args);
    const proceed = await confirmTrainingWheels(command, explanation);
    if (!proceed) {
      throw new Error('Cancelled -- you chose not to run this command.');
    }
    logCommand(command, explanation);
  }
  try {
    const { stdout, stderr } = await execFileAsync('git', args, { cwd });
    return { stdout, stderr };
  } catch (err) {
    throw new Error((err.stderr || err.message || String(err)).trim());
  }
}

// Same as execGit, but never shows the Training Wheels Yes/No confirm,
// regardless of the global "trainingWheels" setting. Still logs the command
// (when an explanation is given) so it shows up in the command log/history --
// only the interactive confirmation is skipped. Used for flows (like branch
// switching) that are meant to run through without popping up a dialog.
async function execGitNoConfirm(cwd, args, explanation) {
  if (explanation) {
    logCommand(formatGitCommand(args), explanation);
  }
  try {
    const { stdout } = await execFileAsync('git', args, { cwd });
    return stdout;
  } catch (err) {
    throw new Error((err.stderr || err.message || String(err)).trim());
  }
}

// Talks to `git credential <action>` over stdin, the same protocol Git
// itself uses to fill/save/erase entries in whatever credential helper is
// configured (Git Credential Manager, the OS keychain, etc).
function runGitCredential(cwd, action, fields) {
  return new Promise((resolve, reject) => {
    const proc = cp.spawn('git', ['credential', action], { cwd });
    let stderr = '';
    proc.stderr.on('data', (d) => (stderr += d));
    proc.on('error', reject);
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(stderr.trim() || `git credential ${action} exited with code ${code}`))));
    const input = Object.entries(fields)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');
    proc.stdin.write(input + '\n\n');
    proc.stdin.end();
  });
}

module.exports = { getWorkspaceRoot, execGit, execGitCapture, execGitNoConfirm, runGitCredential };

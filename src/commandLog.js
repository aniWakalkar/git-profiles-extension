const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const { CONFIG_SECTION } = require('./config');

const LOG_FILE_PATH_KEY = 'logFilePath';
const ENABLE_LOG_KEY = 'enableCommandLog';

let extensionContext;
let logTerminal;
let logWriteEmitter;

function getLogTerminal() {
  if (!logTerminal || logTerminal.exitStatus !== undefined) {
    logWriteEmitter = new vscode.EventEmitter();
    const pty = {
      onDidWrite: logWriteEmitter.event,
      open: () => logWriteEmitter.fire('Git Profiles command log — every command the extension runs shows up here.\r\n\r\n'),
      close: () => {},
      handleInput: () => {}, // read-only: keystrokes typed into this terminal do nothing
    };
    logTerminal = vscode.window.createTerminal({ name: 'Git Profiles Log', pty });
  }
  return logTerminal;
}

function resolveLogFilePath() {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const configured = (config.get(LOG_FILE_PATH_KEY) || '').trim();
  if (configured) return configured;
  return extensionContext ? path.join(extensionContext.globalStorageUri.fsPath, 'command-history.log') : null;
}

function quoteLogArg(arg) {
  return /\s/.test(arg) ? `"${arg}"` : arg;
}

function formatGitCommand(args) {
  return 'git ' + args.map(quoteLogArg).join(' ');
}

function isCommandLogEnabled() {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  return !!config.get(ENABLE_LOG_KEY);
}

// Fire-and-forget by design: logging must never slow down or fail the
// actual git operation it's describing. Off by default -- does nothing
// (no file, no terminal) until the user explicitly turns it on.
function logCommand(command, explanation) {
  if (!isCommandLogEnabled()) return;

  getLogTerminal(); // ensures logWriteEmitter exists / the terminal is created
  const time = new Date().toLocaleTimeString();
  logWriteEmitter.fire(`\x1b[90m[${time}]\x1b[0m \x1b[32m$\x1b[0m ${command}\r\n       \x1b[2m# ${explanation}\x1b[0m\r\n`);

  const filePath = resolveLogFilePath();
  if (!filePath) return;
  const line = `[${new Date().toISOString()}] ${command}  # ${explanation}\n`;
  fs.promises
    .mkdir(path.dirname(filePath), { recursive: true })
    .then(() => fs.promises.appendFile(filePath, line, 'utf8'))
    .catch((err) => console.error('Git Profiles: failed to write command log:', err));
}

async function setLogLocation() {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const current = resolveLogFilePath();

  const picked = await vscode.window.showSaveDialog({
    title: 'Choose where Git Profiles should write its command log',
    defaultUri: current ? vscode.Uri.file(current) : undefined,
    filters: { 'Log files': ['log'], 'All files': ['*'] },
    saveLabel: 'Use this file',
  });
  if (!picked) return;

  await config.update(LOG_FILE_PATH_KEY, picked.fsPath, vscode.ConfigurationTarget.Global);
  vscode.window.showInformationMessage(`Command log will now be written to: ${picked.fsPath}`);
}

async function openCommandLog() {
  const filePath = resolveLogFilePath();
  if (!filePath) {
    vscode.window.showWarningMessage('No log file location is available yet.');
    return;
  }
  try {
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    if (!fs.existsSync(filePath)) {
      await fs.promises.writeFile(filePath, '', 'utf8');
    }
    const doc = await vscode.workspace.openTextDocument(filePath);
    await vscode.window.showTextDocument(doc, { preview: false });
  } catch (err) {
    vscode.window.showErrorMessage(`Couldn't open the log file: ${err.message}`);
  }
}

// Off by default so no log file gets created unless you opt in. Turning it
// ON asks for confirmation first (it starts writing a file to disk); turning
// it OFF needs no confirmation.
async function toggleCommandLog() {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const currentlyEnabled = !!config.get(ENABLE_LOG_KEY);

  if (!currentlyEnabled) {
    const choice = await vscode.window.showWarningMessage(
      'Turn on the Git Profiles command log? This will create a log file on disk and echo every git command Git Profiles runs into a dedicated terminal.',
      { modal: true },
      'Yes',
      'No'
    );
    if (choice !== 'Yes') return;
  }

  await config.update(ENABLE_LOG_KEY, !currentlyEnabled, vscode.ConfigurationTarget.Global);
  vscode.window.showInformationMessage(
    !currentlyEnabled ? 'Command log is ON.' : 'Command log is OFF. No further commands will be logged.'
  );
}

async function toggleTrainingWheels() {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const next = !config.get('trainingWheels');
  await config.update('trainingWheels', next, vscode.ConfigurationTarget.Global);
  vscode.window.showInformationMessage(
    next
      ? 'Training Wheels are ON -- every Git command triggered from the UI will ask "Yes/No" before it runs.'
      : 'Training Wheels are OFF.'
  );
}

function setExtensionContext(context) {
  extensionContext = context;
}

function disposeLogTerminal() {
  if (logTerminal) logTerminal.dispose();
}

module.exports = {
  setExtensionContext,
  getLogTerminal,
  disposeLogTerminal,
  logCommand,
  formatGitCommand,
  setLogLocation,
  openCommandLog,
  toggleCommandLog,
  toggleTrainingWheels,
};

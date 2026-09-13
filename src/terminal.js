const vscode = require('vscode');
const { CONFIG_SECTION } = require('./config');
const { logCommand } = require('./commandLog');

let sharedTerminal;

function getTerminal() {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const reuse = config.get('runInSameTerminal');

  if (reuse) {
    if (!sharedTerminal || sharedTerminal.exitStatus !== undefined) {
      sharedTerminal = vscode.window.createTerminal('Git Profiles');
    }
    return sharedTerminal;
  }
  return vscode.window.createTerminal('Git Profiles');
}

function runCommandsInTerminal(commands, profileName) {
  if (!commands || commands.length === 0) {
    vscode.window.showWarningMessage('No commands to run.');
    return;
  }
  const terminal = getTerminal();
  terminal.show();
  // Send each command as its own line instead of joining with "&&".
  // Windows PowerShell 5.1 (the default integrated shell on many Windows
  // machines) does not support "&&" as a statement separator, so joining
  // commands that way throws "token '&&' is not a valid statement separator".
  // Sending them one at a time works identically across PowerShell, CMD, and bash.
  for (const cmd of commands) {
    terminal.sendText(cmd);
    logCommand(cmd, profileName ? `Run as part of the "${profileName}" profile` : 'Run via Git Profiles');
  }
}

function disposeSharedTerminal() {
  if (sharedTerminal) sharedTerminal.dispose();
}

module.exports = { runCommandsInTerminal, disposeSharedTerminal };

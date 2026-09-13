const vscode = require('vscode');
const os = require('os');
const { getWorkspaceRoot, execGit, runGitCredential } = require('./gitExec');
const { logCommand } = require('./commandLog');

async function setAuthentication(context) {
  const root = getWorkspaceRoot();
  const cwd = root || os.homedir();

  const name = await vscode.window.showInputBox({
    prompt: 'Git author name (optional, used for commit authorship)',
    placeHolder: 'Your Name',
    ignoreFocusOut: true,
  });
  if (name === undefined) return;

  const email = await vscode.window.showInputBox({
    prompt: 'Git email',
    placeHolder: 'you@example.com',
    ignoreFocusOut: true,
    validateInput: (v) => (v && v.includes('@') ? null : 'Enter a valid email'),
  });
  if (!email) return;

  const host = await vscode.window.showInputBox({
    prompt: 'Git host this login is for',
    value: 'github.com',
    ignoreFocusOut: true,
    validateInput: (v) => (v && v.trim().length > 0 ? null : 'Host cannot be empty'),
  });
  if (!host) return;

  const token = await vscode.window.showInputBox({
    prompt: `Password or Personal Access Token for ${host}`,
    placeHolder: 'Hidden while typing, never written to disk in plain text',
    password: true,
    ignoreFocusOut: true,
    validateInput: (v) => (v && v.trim().length > 0 ? null : 'Enter a password/token'),
  });
  if (!token) return;

  try {
    if (name) {
      await execGit(cwd, ['config', '--global', 'user.name', name], `Set your Git commit author name to "${name}"`);
    }
    await execGit(cwd, ['config', '--global', 'user.email', email], `Set your Git commit author email to "${email}"`);

    // Don't stomp an existing helper (e.g. Git Credential Manager) if one's
    // already configured -- only fall back to git's plain-text store when
    // nothing else is set up.
    let helper = '';
    try {
      helper = (await execGit(cwd, ['config', '--global', 'credential.helper'])).trim();
    } catch {
      // no helper configured yet
    }
    if (!helper) {
      await execGit(
        cwd,
        ['config', '--global', 'credential.helper', 'store'],
        "Enable Git's built-in credential cache so it stops prompting for a password"
      );
    }

    await runGitCredential(cwd, 'approve', { protocol: 'https', host, username: email, password: token });
    logCommand('git credential approve', `Cache your Git login for ${host} so future pushes/pulls don't prompt`);

    await context.secrets.store('gitProfiles.authEmail', email);
    await context.secrets.store('gitProfiles.authHost', host);

    vscode.window.showInformationMessage(
      helper
        ? `Saved. Git should stop prompting for ${host} (cached via your existing "${helper}" credential helper).`
        : `Saved. Git should stop prompting for ${host}. Note: no credential helper was configured, so git cached this in its plain-text store (~/.git-credentials) -- installing Git Credential Manager is more secure.`
    );
  } catch (err) {
    vscode.window.showErrorMessage(`Failed to save authentication: ${err.message}`);
  }
}

async function clearAuthentication(context) {
  const root = getWorkspaceRoot();
  const cwd = root || os.homedir();

  const host = await context.secrets.get('gitProfiles.authHost');
  const email = await context.secrets.get('gitProfiles.authEmail');
  if (!host || !email) {
    vscode.window.showInformationMessage('No saved authentication to clear.');
    return;
  }

  try {
    await runGitCredential(cwd, 'reject', { protocol: 'https', host, username: email });
    logCommand('git credential reject', `Remove the cached Git login for ${host}`);
    await context.secrets.delete('gitProfiles.authEmail');
    await context.secrets.delete('gitProfiles.authHost');
    vscode.window.showInformationMessage(`Cleared cached authentication for ${host}.`);
  } catch (err) {
    vscode.window.showErrorMessage(`Failed to clear authentication: ${err.message}`);
  }
}

module.exports = { setAuthentication, clearAuthentication };

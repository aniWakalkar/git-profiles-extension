const vscode = require('vscode');

const CONFIG_SECTION = 'gitProfiles';
const PROFILES_KEY = 'profiles';

// -------------------- settings helpers --------------------

function getProfiles() {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const value = config.get(PROFILES_KEY) || {};
  // VS Code hands back a read-only/proxied view of the live config value.
  // Callers throughout the extension mutate the object they get back
  // (delete/assign keys) before calling saveProfiles, so return a plain,
  // detached deep copy instead of that live value.
  return JSON.parse(JSON.stringify(value));
}

async function saveProfiles(profiles, target) {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);

  if (target !== undefined) {
    await config.update(PROFILES_KEY, profiles, target);
    return;
  }

  // VS Code merges object-type settings across scopes (workspace keys layer
  // on top of user/global keys) instead of one scope fully replacing the
  // other. Writing the new value to only one scope can leave a profile that
  // was originally defined in a different scope "merging back in" even
  // after it's deleted here. So: write the same final value to every scope
  // that currently defines this setting, not just one.
  const inspected = config.inspect(PROFILES_KEY);
  const scopes = [];
  if (inspected && inspected.globalValue !== undefined) scopes.push(vscode.ConfigurationTarget.Global);
  if (inspected && inspected.workspaceValue !== undefined) scopes.push(vscode.ConfigurationTarget.Workspace);
  if (inspected && inspected.workspaceFolderValue !== undefined) scopes.push(vscode.ConfigurationTarget.WorkspaceFolder);
  if (scopes.length === 0) {
    scopes.push(vscode.workspace.workspaceFolders ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global);
  }

  for (const scope of scopes) {
    await config.update(PROFILES_KEY, profiles, scope);
  }
}

module.exports = { CONFIG_SECTION, PROFILES_KEY, getProfiles, saveProfiles };

const vscode = require('vscode');

const CONFIG_SECTION = 'gitProfiles';
const PROFILES_KEY = 'profiles';

// Shown on first use only. After that they live in the user's settings so
// they can be edited or deleted like any other profile. These must NOT be
// package.json configuration defaults — VS Code merges those back in after
// every delete, so Normal/Migration would be undeletable.
const DEFAULT_PROFILES = {
  Normal: [
    'git add .',
    'git commit -m "update"',
    'git push',
  ],
  Migration: [
    'git add .',
    'git commit -m "migration"',
    'git push origin migration',
  ],
};

// -------------------- settings helpers --------------------

function getStoredProfiles() {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const inspected = config.inspect(PROFILES_KEY);
  // Merge stored scopes only. Skip defaultValue so package.json samples
  // (if any) cannot resurrect a profile the user just deleted.
  return {
    ...(inspected && inspected.globalValue ? inspected.globalValue : {}),
    ...(inspected && inspected.workspaceValue ? inspected.workspaceValue : {}),
    ...(inspected && inspected.workspaceFolderValue ? inspected.workspaceFolderValue : {}),
  };
}

function hasStoredProfiles() {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const inspected = config.inspect(PROFILES_KEY);
  return Boolean(
    inspected &&
      (inspected.globalValue !== undefined ||
        inspected.workspaceValue !== undefined ||
        inspected.workspaceFolderValue !== undefined)
  );
}

function getProfiles() {
  const value = getStoredProfiles();
  // VS Code hands back a read-only/proxied view of the live config value.
  // Callers throughout the extension mutate the object they get back
  // (delete/assign keys) before calling saveProfiles, so return a plain,
  // detached deep copy instead of that live value.
  return JSON.parse(JSON.stringify(value));
}

async function ensureDefaultProfiles() {
  if (hasStoredProfiles()) return;
  const target = vscode.workspace.workspaceFolders
    ? vscode.ConfigurationTarget.Workspace
    : vscode.ConfigurationTarget.Global;
  await saveProfiles(JSON.parse(JSON.stringify(DEFAULT_PROFILES)), target);
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

module.exports = {
  CONFIG_SECTION,
  PROFILES_KEY,
  DEFAULT_PROFILES,
  getProfiles,
  saveProfiles,
  ensureDefaultProfiles,
};

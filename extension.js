const vscode = require('vscode');

const CONFIG_SECTION = 'gitProfiles';
const PROFILES_KEY = 'profiles';

// -------------------- settings helpers --------------------

function getProfiles() {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  return config.get(PROFILES_KEY) || {};
}

async function saveProfiles(profiles, target) {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const configTarget =
    target !== undefined
      ? target
      : vscode.workspace.workspaceFolders
      ? vscode.ConfigurationTarget.Workspace
      : vscode.ConfigurationTarget.Global;
  await config.update(PROFILES_KEY, profiles, configTarget);
}

// -------------------- terminal helper --------------------

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

function runCommandsInTerminal(commands) {
  if (!commands || commands.length === 0) {
    vscode.window.showWarningMessage('No commands to run.');
    return;
  }
  const terminal = getTerminal();
  terminal.show();
  terminal.sendText(commands.join(' && '));
}

// -------------------- Tree View --------------------
// Two node kinds:
//   profile node -> { type: 'profile', name }
//   command node -> { type: 'command', profileName, index, text }

class GitProfilesTreeItem extends vscode.TreeItem {
  constructor(node, collapsibleState) {
    const label = node.type === 'profile' ? node.name : node.text;
    super(label, collapsibleState);
    this.node = node;

    if (node.type === 'profile') {
      this.contextValue = 'profile';
      this.iconPath = new vscode.ThemeIcon('git-branch');
      this.tooltip = 'Click to run this profile with checked commands';
      this.command = {
        command: 'gitProfiles.runChecked',
        title: 'Run',
        arguments: [node],
      };
    } else {
      this.contextValue = 'command';
      this.iconPath = new vscode.ThemeIcon('terminal');
    }
  }
}

class GitProfilesProvider {
  constructor() {
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    // profileName -> Set of checked command indices
    this.checkedState = new Map();
  }

  refresh() {
    this._onDidChangeTreeData.fire();
  }

  ensureCheckedSet(profileName, commandCount) {
    if (!this.checkedState.has(profileName)) {
      this.checkedState.set(profileName, new Set(Array.from({ length: commandCount }, (_, i) => i)));
    }
    return this.checkedState.get(profileName);
  }

  getTreeItem(node) {
    if (node.type === 'profile') {
      const item = new GitProfilesTreeItem(node, vscode.TreeItemCollapsibleState.Collapsed);
      return item;
    }

    const item = new GitProfilesTreeItem(node, vscode.TreeItemCollapsibleState.None);
    const checkedSet = this.ensureCheckedSet(node.profileName, node.total);
    item.checkboxState = checkedSet.has(node.index)
      ? vscode.TreeItemCheckboxState.Checked
      : vscode.TreeItemCheckboxState.Unchecked;
    return item;
  }

  getChildren(node) {
    const profiles = getProfiles();

    if (!node) {
      return Object.keys(profiles).map((name) => ({ type: 'profile', name }));
    }

    if (node.type === 'profile') {
      const commands = profiles[node.name] || [];
      this.ensureCheckedSet(node.name, commands.length);
      return commands.map((text, index) => ({
        type: 'command',
        profileName: node.name,
        index,
        total: commands.length,
        text,
      }));
    }

    return [];
  }

  getCheckedCommands(profileName) {
    const profiles = getProfiles();
    const all = profiles[profileName] || [];
    const checkedSet = this.ensureCheckedSet(profileName, all.length);
    return all.filter((_, i) => checkedSet.has(i));
  }

  setChecked(profileName, index, checked) {
    const set = this.ensureCheckedSet(profileName, index + 1);
    if (checked) set.add(index);
    else set.delete(index);
  }

  checkAll(profileName) {
    const profiles = getProfiles();
    const count = (profiles[profileName] || []).length;
    this.checkedState.set(profileName, new Set(Array.from({ length: count }, (_, i) => i)));
    this.refresh();
  }

  uncheckAll(profileName) {
    this.checkedState.set(profileName, new Set());
    this.refresh();
  }
}

// -------------------- Profile / Command CRUD (shared by palette + tree) --------------------

async function createProfile() {
  const name = await vscode.window.showInputBox({
    prompt: 'New profile name (e.g. Frontend, Migration, Staging)',
    validateInput: (v) => (v && v.trim().length > 0 ? null : 'Name cannot be empty'),
  });
  if (!name) return;

  const profiles = getProfiles();
  if (profiles[name]) {
    const overwrite = await vscode.window.showWarningMessage(
      `A profile named "${name}" already exists. Overwrite it?`,
      'Overwrite',
      'Cancel'
    );
    if (overwrite !== 'Overwrite') return;
  }

  const commandsRaw = await vscode.window.showInputBox({
    prompt: 'Enter git commands separated by " && " (e.g. git add . && git commit -m "msg" && git push origin dev)',
    placeHolder: 'git add . && git commit -m "update" && git push',
  });
  if (!commandsRaw) return;

  const commands = commandsRaw.split('&&').map((c) => c.trim()).filter(Boolean);
  profiles[name] = commands;
  await saveProfiles(profiles);
  vscode.window.showInformationMessage(`Profile "${name}" saved.`);
  return name;
}

async function editProfile() {
  const profiles = getProfiles();
  const names = Object.keys(profiles);
  if (names.length === 0) {
    vscode.window.showInformationMessage('No profiles to edit yet. Create one first.');
    return;
  }
  const picked = await vscode.window.showQuickPick(names, { placeHolder: 'Select a profile to edit' });
  if (!picked) return;
  await editProfileCommandsRaw(picked);
}

async function editProfileCommandsRaw(profileName) {
  const profiles = getProfiles();
  const currentRaw = (profiles[profileName] || []).join(' && ');
  const updatedRaw = await vscode.window.showInputBox({
    prompt: `Edit commands for "${profileName}" (separated by " && ")`,
    value: currentRaw,
  });
  if (updatedRaw === undefined) return;

  const commands = updatedRaw.split('&&').map((c) => c.trim()).filter(Boolean);
  profiles[profileName] = commands;
  await saveProfiles(profiles);
  vscode.window.showInformationMessage(`Profile "${profileName}" updated.`);
}

async function deleteProfile() {
  const profiles = getProfiles();
  const names = Object.keys(profiles);
  if (names.length === 0) {
    vscode.window.showInformationMessage('No profiles to delete.');
    return;
  }
  const picked = await vscode.window.showQuickPick(names, { placeHolder: 'Select a profile to delete' });
  if (!picked) return;
  await deleteProfileByName(picked);
}

async function deleteProfileByName(name) {
  const confirm = await vscode.window.showWarningMessage(`Delete profile "${name}"?`, 'Delete', 'Cancel');
  if (confirm !== 'Delete') return;
  const profiles = getProfiles();
  delete profiles[name];
  await saveProfiles(profiles);
  vscode.window.showInformationMessage(`Profile "${name}" deleted.`);
}

async function openSettings() {
  await vscode.commands.executeCommand('workbench.action.openSettingsJson', {
    revealSetting: { key: 'gitProfiles.profiles' },
  });
}

async function runProfileViaPalette() {
  const profiles = getProfiles();
  const names = Object.keys(profiles);
  if (names.length === 0) {
    const choice = await vscode.window.showInformationMessage(
      'No Git profiles configured yet. Create one now?',
      'Create Profile'
    );
    if (choice === 'Create Profile') await createProfile();
    return;
  }
  const picked = await vscode.window.showQuickPick(
    names.map((name) => ({ label: name, description: (profiles[name] || []).join('  ->  ') })),
    { placeHolder: 'Select a Git profile to run' }
  );
  if (!picked) return;
  runCommandsInTerminal(profiles[picked.label]);
}

function activate(context) {
  const provider = new GitProfilesProvider();
  const treeView = vscode.window.createTreeView('gitProfilesView', {
    treeDataProvider: provider,
    showCollapseAll: true,
  });

  // checkbox toggles from the sidebar
  treeView.onDidChangeCheckboxState((e) => {
    for (const [node, state] of e.items) {
      if (node.type === 'command') {
        provider.setChecked(node.profileName, node.index, state === vscode.TreeItemCheckboxState.Checked);
      }
    }
  });

  context.subscriptions.push(
    treeView,

    vscode.commands.registerCommand('gitProfiles.run', runProfileViaPalette),

    vscode.commands.registerCommand('gitProfiles.createProfile', async () => {
      await createProfile();
      provider.refresh();
    }),

    vscode.commands.registerCommand('gitProfiles.editProfile', async () => {
      await editProfile();
      provider.refresh();
    }),

    vscode.commands.registerCommand('gitProfiles.deleteProfile', async () => {
      await deleteProfile();
      provider.refresh();
    }),

    vscode.commands.registerCommand('gitProfiles.openSettings', openSettings),

    vscode.commands.registerCommand('gitProfiles.refreshView', () => provider.refresh()),

    // Run only the checked commands for a profile (used by sidebar click + inline play button)
    vscode.commands.registerCommand('gitProfiles.runChecked', (node) => {
      if (!node || node.type !== 'profile') return;
      const commands = provider.getCheckedCommands(node.name);
      runCommandsInTerminal(commands);
    }),

    vscode.commands.registerCommand('gitProfiles.deleteProfileTree', async (node) => {
      if (!node || node.type !== 'profile') return;
      await deleteProfileByName(node.name);
      provider.checkedState.delete(node.name);
      provider.refresh();
    }),

    vscode.commands.registerCommand('gitProfiles.renameProfile', async (node) => {
      if (!node || node.type !== 'profile') return;
      const newName = await vscode.window.showInputBox({
        prompt: `Rename "${node.name}" to:`,
        value: node.name,
        validateInput: (v) => (v && v.trim().length > 0 ? null : 'Name cannot be empty'),
      });
      if (!newName || newName === node.name) return;

      const profiles = getProfiles();
      if (profiles[newName]) {
        vscode.window.showErrorMessage(`A profile named "${newName}" already exists.`);
        return;
      }
      profiles[newName] = profiles[node.name];
      delete profiles[node.name];
      await saveProfiles(profiles);
      provider.refresh();
    }),

    vscode.commands.registerCommand('gitProfiles.addCommandToProfile', async (node) => {
      if (!node || node.type !== 'profile') return;
      const newCommand = await vscode.window.showInputBox({
        prompt: `New command to add to "${node.name}"`,
        placeHolder: 'git push origin feature/my-branch',
      });
      if (!newCommand) return;

      const profiles = getProfiles();
      profiles[node.name] = [...(profiles[node.name] || []), newCommand.trim()];
      await saveProfiles(profiles);
      provider.refresh();
    }),

    vscode.commands.registerCommand('gitProfiles.editCommand', async (node) => {
      if (!node || node.type !== 'command') return;
      const updated = await vscode.window.showInputBox({
        prompt: `Edit command in "${node.profileName}"`,
        value: node.text,
      });
      if (updated === undefined) return;

      const profiles = getProfiles();
      const list = profiles[node.profileName] || [];
      list[node.index] = updated;
      profiles[node.profileName] = list;
      await saveProfiles(profiles);
      provider.refresh();
    }),

    vscode.commands.registerCommand('gitProfiles.deleteCommand', async (node) => {
      if (!node || node.type !== 'command') return;
      const profiles = getProfiles();
      const list = profiles[node.profileName] || [];
      list.splice(node.index, 1);
      profiles[node.profileName] = list;
      await saveProfiles(profiles);
      provider.checkedState.delete(node.profileName); // reset checks, indices shifted
      provider.refresh();
    }),

    vscode.commands.registerCommand('gitProfiles.checkAllCommands', (node) => {
      if (!node || node.type !== 'profile') return;
      provider.checkAll(node.name);
    }),

    vscode.commands.registerCommand('gitProfiles.uncheckAllCommands', (node) => {
      if (!node || node.type !== 'profile') return;
      provider.uncheckAll(node.name);
    }),

    // repaint the tree whenever settings.json changes underneath us
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(`${CONFIG_SECTION}.${PROFILES_KEY}`)) {
        provider.refresh();
      }
    })
  );
}

function deactivate() {
  if (sharedTerminal) sharedTerminal.dispose();
}

module.exports = { activate, deactivate };

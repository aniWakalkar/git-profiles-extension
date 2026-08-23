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
  // Send each command as its own line instead of joining with "&&".
  // Windows PowerShell 5.1 (the default integrated shell on many Windows
  // machines) does not support "&&" as a statement separator, so joining
  // commands that way throws "token '&&' is not a valid statement separator".
  // Sending them one at a time works identically across PowerShell, CMD, and bash.
  for (const cmd of commands) {
    terminal.sendText(cmd);
  }
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

// -------------------- Profile form (Webview panel) --------------------
// Shows a proper side-by-side form: Name field at top, a Commands list
// below with one row per command (each with its own remove button) and
// an "+ Add Command" button, plus Save / Cancel. Used for both creating
// a brand-new profile and doing a full edit of an existing one.

function getFormHtml(webview, initialName, initialCommands) {
  const nonce = String(Date.now());
  const safeName = (initialName || '').replace(/"/g, '&quot;');
  const commandsJson = JSON.stringify(initialCommands || ['']);

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
  body {
    font-family: var(--vscode-font-family);
    color: var(--vscode-foreground);
    padding: 20px 24px;
  }
  label {
    display: block;
    font-weight: 600;
    margin-bottom: 6px;
    margin-top: 18px;
  }
  input[type="text"] {
    width: 100%;
    box-sizing: border-box;
    padding: 6px 8px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 3px;
    font-family: var(--vscode-editor-font-family);
  }
  .command-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }
  .command-row input {
    flex: 1;
  }
  .icon-btn {
    background: transparent;
    border: none;
    color: var(--vscode-foreground);
    opacity: 0.7;
    cursor: pointer;
    font-size: 16px;
    line-height: 1;
    padding: 4px 8px;
    border-radius: 3px;
  }
  .icon-btn:hover {
    opacity: 1;
    background: var(--vscode-toolbar-hoverBackground, rgba(128,128,128,0.2));
  }
  #addBtn {
    margin-top: 4px;
    background: transparent;
    border: 1px dashed var(--vscode-input-border, #888);
    color: var(--vscode-foreground);
    padding: 6px 12px;
    border-radius: 3px;
    cursor: pointer;
    width: 100%;
    text-align: left;
  }
  #addBtn:hover {
    background: var(--vscode-toolbar-hoverBackground, rgba(128,128,128,0.15));
  }
  .actions {
    display: flex;
    gap: 10px;
    margin-top: 28px;
  }
  button.primary {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    padding: 8px 18px;
    border-radius: 3px;
    cursor: pointer;
    font-size: 13px;
  }
  button.primary:hover {
    background: var(--vscode-button-hoverBackground);
  }
  button.secondary {
    background: var(--vscode-button-secondaryBackground, transparent);
    color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
    border: 1px solid var(--vscode-input-border, #888);
    padding: 8px 18px;
    border-radius: 3px;
    cursor: pointer;
    font-size: 13px;
  }
  .hint {
    opacity: 0.65;
    font-size: 12px;
    margin-top: 4px;
  }
</style>
</head>
<body>
  <label for="name">Profile Name</label>
  <input type="text" id="name" value="${safeName}" placeholder="e.g. Frontend, Migration, Staging" />

  <label>Commands</label>
  <div id="commandsList"></div>
  <button id="addBtn">+ Add Command</button>
  <div class="hint">Each row runs one after another, in order, when this profile is executed.</div>

  <div class="actions">
    <button class="primary" id="saveBtn">Save Profile</button>
    <button class="secondary" id="cancelBtn">Cancel</button>
  </div>

<script nonce="${nonce}">
  const vscodeApi = acquireVsCodeApi();
  let commands = ${commandsJson};

  const listEl = document.getElementById('commandsList');
  const nameEl = document.getElementById('name');

  function render() {
    listEl.innerHTML = '';
    commands.forEach((cmd, i) => {
      const row = document.createElement('div');
      row.className = 'command-row';

      const input = document.createElement('input');
      input.type = 'text';
      input.value = cmd;
      input.placeholder = 'e.g. git add .';
      input.addEventListener('input', (e) => { commands[i] = e.target.value; });

      const removeBtn = document.createElement('button');
      removeBtn.className = 'icon-btn';
      removeBtn.title = 'Remove command';
      removeBtn.textContent = '✕';
      removeBtn.addEventListener('click', () => {
        commands.splice(i, 1);
        if (commands.length === 0) commands.push('');
        render();
      });

      row.appendChild(input);
      row.appendChild(removeBtn);
      listEl.appendChild(row);
    });
  }

  document.getElementById('addBtn').addEventListener('click', () => {
    commands.push('');
    render();
  });

  document.getElementById('saveBtn').addEventListener('click', () => {
    const cleaned = commands.map((c) => c.trim()).filter(Boolean);
    vscodeApi.postMessage({ type: 'save', name: nameEl.value.trim(), commands: cleaned });
  });

  document.getElementById('cancelBtn').addEventListener('click', () => {
    vscodeApi.postMessage({ type: 'cancel' });
  });

  render();
</script>
</body>
</html>`;
}

/**
 * Opens the form panel. If originalName is provided, it's an edit of an
 * existing profile (panel is pre-filled); otherwise it's a brand-new profile.
 */
function openProfileForm(originalName) {
  const profiles = getProfiles();
  const initialName = originalName || '';
  const initialCommands = originalName ? profiles[originalName] || [''] : [''];

  const panel = vscode.window.createWebviewPanel(
    'gitProfilesForm',
    originalName ? `Edit Profile: ${originalName}` : 'New Git Profile',
    vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: false }
  );

  panel.webview.html = getFormHtml(panel.webview, initialName, initialCommands);

  panel.webview.onDidReceiveMessage(async (message) => {
    if (message.type === 'cancel') {
      panel.dispose();
      return;
    }

    if (message.type === 'save') {
      const newName = message.name;
      const commands = message.commands;

      if (!newName) {
        vscode.window.showErrorMessage('Profile name cannot be empty.');
        return;
      }
      if (!commands || commands.length === 0) {
        vscode.window.showErrorMessage('Add at least one command.');
        return;
      }

      const current = getProfiles();

      // Renaming during edit: drop the old key.
      if (originalName && originalName !== newName) {
        delete current[originalName];
      } else if (!originalName && current[newName]) {
        const overwrite = await vscode.window.showWarningMessage(
          `A profile named "${newName}" already exists. Overwrite it?`,
          'Overwrite',
          'Cancel'
        );
        if (overwrite !== 'Overwrite') return;
      }

      current[newName] = commands;
      await saveProfiles(current);
      vscode.window.showInformationMessage(`Profile "${newName}" saved.`);
      panel.dispose();
    }
  });
}

// -------------------- Profile / Command CRUD (shared by palette + tree) --------------------

async function createProfile() {
  openProfileForm(null);
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
  openProfileForm(picked);
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

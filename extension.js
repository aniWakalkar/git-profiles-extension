const vscode = require('vscode');

const { CONFIG_SECTION, PROFILES_KEY, getProfiles, saveProfiles, ensureDefaultProfiles } = require('./src/config');
const { runCommandsInTerminal, disposeSharedTerminal } = require('./src/terminal');
const {
  setExtensionContext,
  getLogTerminal,
  disposeLogTerminal,
  setLogLocation,
  openCommandLog,
  toggleCommandLog,
  toggleTrainingWheels,
} = require('./src/commandLog');
const { setAuthentication, clearAuthentication } = require('./src/auth');
const { stageFile, unstageFile, stageAllChanges, unstageAllChanges } = require('./src/changes');
const { switchBranch, pullChanges } = require('./src/branches');
const {
  GitShowContentProvider,
  openChangeDiff,
  discardChange,
  revertCheckedFiles,
  revertFileToCommit,
} = require('./src/diffRevert');
const { openCommitPanel } = require('./src/commitPanel');
const { openCommitHistory } = require('./src/commitHistoryPanel');
const { GitChangesProvider } = require('./src/changesTree');
const { GitActionsProvider } = require('./src/actionsTree');
const { GitProfilesProvider } = require('./src/profilesTree');
const { openProfileForm } = require('./src/profileForm');
const {
  createProfile,
  editProfile,
  deleteProfile,
  deleteProfileByName,
  openSettings,
  runProfileViaPalette,
} = require('./src/profileCommands');

// Entry point: runs once when the extension starts, sets up both sidebar
// views and registers every command the extension provides.
async function activate(context) {
  setExtensionContext(context);
  await ensureDefaultProfiles();

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

  const changesProvider = new GitChangesProvider();
  const changesView = vscode.window.createTreeView('gitChangesView', {
    treeDataProvider: changesProvider,
    showCollapseAll: false,
  });
  changesProvider.refresh();

  // Its own sidebar section for the branch/commit actions (Switch Branch,
  // Pull, Show Commit History) -- mostly a home for that title-bar toolbar,
  // separate from Changes, plus a small body of its own that shows the
  // result of "Pull" once it's been run.
  const actionsProvider = new GitActionsProvider();
  const actionsView = vscode.window.createTreeView('gitActionsView', {
    treeDataProvider: actionsProvider,
  });

  // Supplies file content (HEAD/INDEX/a specific commit) to the diff viewer.
  const gitShowProvider = vscode.workspace.registerTextDocumentContentProvider(
    'git-profiles-show',
    new GitShowContentProvider(() => changesProvider.root)
  );

  // Status bar branch indicator: click it to open the QuickPick branch switcher.
  const branchStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  branchStatusBarItem.command = 'gitProfiles.switchBranch';
  branchStatusBarItem.tooltip = 'Click to switch Git branch';
  const refreshBranchStatusBar = () => {
    if (changesProvider.currentBranch) {
      branchStatusBarItem.text = `$(git-branch) ${changesProvider.currentBranch}`;
      branchStatusBarItem.show();
    } else {
      branchStatusBarItem.hide();
    }
  };
  changesProvider.onDidChangeTreeData(refreshBranchStatusBar);
  refreshBranchStatusBar();

  // Number badge on the Custom Git Profiles activity-bar icon, like Source Control.
  // Set on the first view in the container so VS Code paints it on the icon.
  const updateChangesBadge = () => {
    const count = changesProvider.changedFileCount();
    treeView.badge = count > 0
      ? {
          value: count,
          tooltip: count === 1 ? '1 file with changes' : `${count} files with changes`,
        }
      : undefined;
  };
  changesProvider.onDidChangeTreeData(updateChangesBadge);
  updateChangesBadge();

  // Checking/unchecking a file's checkbox stages/unstages it.
  changesView.onDidChangeCheckboxState((e) => {
    for (const [node, state] of e.items) {
      let gitOp;

      if (node.type === 'file') {
        const checked = state === vscode.TreeItemCheckboxState.Checked;
        // Repaint immediately with the new state, then run the actual git
        // command in the background — clicking a checkbox shouldn't have to
        // wait on a git process before the UI responds.
        changesProvider.moveFileLocally(node.filePath, checked);
        gitOp = checked ? stageFile(node.root, node.filePath) : unstageFile(node.root, node.filePath);
      }

      if (gitOp) {
        gitOp
          .catch((err) => vscode.window.showErrorMessage(`Git error: ${err.message}`))
          .finally(() => changesProvider.refresh());
      }
    }
  });

  // Keep the Changes view in sync as files are edited/added/deleted on disk.
  let refreshChangesTimer;
  const scheduleChangesRefresh = () => {
    clearTimeout(refreshChangesTimer);
    refreshChangesTimer = setTimeout(() => changesProvider.refresh(), 400);
  };
  const changesWatcher = vscode.workspace.createFileSystemWatcher('**/*');
  changesWatcher.onDidChange(scheduleChangesRefresh);
  changesWatcher.onDidCreate(scheduleChangesRefresh);
  changesWatcher.onDidDelete(scheduleChangesRefresh);

  context.subscriptions.push(
    treeView,
    changesView,
    actionsView,
    changesWatcher,
    gitShowProvider,

    // Feature: run a profile's commands, picked from a list, in the terminal.
    vscode.commands.registerCommand('gitProfiles.run', runProfileViaPalette),

    // Feature: create a new profile.
    vscode.commands.registerCommand('gitProfiles.createProfile', async () => {
      await createProfile();
      provider.refresh();
    }),

    // Feature: edit an existing profile.
    vscode.commands.registerCommand('gitProfiles.editProfile', async () => {
      await editProfile();
      provider.refresh();
    }),

    // Feature: delete a profile (picked from a list).
    vscode.commands.registerCommand('gitProfiles.deleteProfile', async () => {
      await deleteProfile();
      provider.refresh();
    }),

    // Feature: open the profiles setting directly in settings.json.
    vscode.commands.registerCommand('gitProfiles.openSettings', openSettings),

    // Feature: set up Git login (name, email, token) on this machine.
    vscode.commands.registerCommand('gitProfiles.setAuthentication', () => setAuthentication(context)),

    // Feature: clear the saved Git login.
    vscode.commands.registerCommand('gitProfiles.clearAuthentication', () => clearAuthentication(context)),

    // Feature: switch to a different branch.
    vscode.commands.registerCommand('gitProfiles.switchBranch', () => switchBranch(changesProvider)),

    // Feature: pull the latest changes for the current branch.
    vscode.commands.registerCommand('gitProfiles.pullChanges', () => pullChanges(changesProvider, actionsProvider)),

    // Feature: browse commit history for a chosen branch.
    vscode.commands.registerCommand('gitProfiles.showCommitHistory', () => openCommitHistory(changesProvider)),

    // Feature: choose where the command log file is saved.
    vscode.commands.registerCommand('gitProfiles.setLogLocation', setLogLocation),

    // Feature: open the command log file.
    vscode.commands.registerCommand('gitProfiles.openCommandLog', openCommandLog),

    // Feature: turn command logging on/off (off by default -- no log file until enabled).
    vscode.commands.registerCommand('gitProfiles.toggleCommandLog', toggleCommandLog),

    // Feature: show the read-only terminal that echoes every git command run.
    vscode.commands.registerCommand('gitProfiles.showCommandLogTerminal', () => getLogTerminal().show()),

    // Feature: turn Training Wheels (confirm-before-run) on or off.
    vscode.commands.registerCommand('gitProfiles.toggleTrainingWheels', toggleTrainingWheels),

    branchStatusBarItem,

    // Feature: refresh the Custom Git Profiles sidebar tree.
    vscode.commands.registerCommand('gitProfiles.refreshView', () => provider.refresh()),

    // Feature: refresh the Changes sidebar tree.
    vscode.commands.registerCommand('gitProfiles.refreshChanges', () => changesProvider.refresh()),

    // Feature: open the commit panel to stage files and commit.
    vscode.commands.registerCommand('gitProfiles.commitChanges', () => openCommitPanel(changesProvider)),

    // Feature: stage every changed file at once.
    vscode.commands.registerCommand('gitProfiles.stageAllChanges', async () => {
      if (!changesProvider.root) return;
      try {
        await stageAllChanges(changesProvider.root);
      } catch (err) {
        vscode.window.showErrorMessage(`Git error: ${err.message}`);
      }
      await changesProvider.refresh();
    }),

    // Feature: unstage every staged file at once.
    vscode.commands.registerCommand('gitProfiles.unstageAllChanges', async () => {
      if (!changesProvider.root) return;
      try {
        await unstageAllChanges(changesProvider.root);
      } catch (err) {
        vscode.window.showErrorMessage(`Git error: ${err.message}`);
      }
      await changesProvider.refresh();
    }),

    // Feature: open the diff for a changed file.
    vscode.commands.registerCommand('gitProfiles.openChangeDiff', openChangeDiff),

    // Feature: discard uncommitted changes to a file.
    vscode.commands.registerCommand('gitProfiles.discardChange', async (node) => {
      await discardChange(node);
      await changesProvider.refresh();
    }),

    // Feature: revert a single file back to an earlier commit.
    vscode.commands.registerCommand('gitProfiles.revertFileToCommit', async (node) => {
      await revertFileToCommit(node);
      await changesProvider.refresh();
    }),

    // Feature: revert every checked file back to the last commit.
    vscode.commands.registerCommand('gitProfiles.revertCheckedFiles', () => revertCheckedFiles(changesProvider)),

    // Feature: run only the checked commands for a profile (sidebar click + inline play button).
    vscode.commands.registerCommand('gitProfiles.runChecked', (node) => {
      if (!node || node.type !== 'profile') return;
      const commands = provider.getCheckedCommands(node.name);
      runCommandsInTerminal(commands, node.name);
    }),

    // Feature: delete a profile from the sidebar.
    vscode.commands.registerCommand('gitProfiles.deleteProfileTree', async (node) => {
      if (!node || node.type !== 'profile') return;
      await deleteProfileByName(node.name);
      provider.checkedState.delete(node.name);
      provider.refresh();
    }),

    // Feature: rename a profile.
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

    // Feature: add a command to a profile.
    vscode.commands.registerCommand('gitProfiles.addCommandToProfile', (node) => {
      if (!node || node.type !== 'profile') return;
      // Same full form used to create a profile in the first place, so
      // adding a command gets the same command-list UI (with autocomplete)
      // instead of a bare one-line input box.
      openProfileForm(node.name);
    }),

    // Feature: edit a command inside a profile.
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

    // Feature: delete a command from a profile.
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

    // Feature: check all commands in a profile.
    vscode.commands.registerCommand('gitProfiles.checkAllCommands', (node) => {
      if (!node || node.type !== 'profile') return;
      provider.checkAll(node.name);
    }),

    // Feature: uncheck all commands in a profile.
    vscode.commands.registerCommand('gitProfiles.uncheckAllCommands', (node) => {
      if (!node || node.type !== 'profile') return;
      provider.uncheckAll(node.name);
    }),

    // Feature: keep the profiles tree in sync when settings.json changes underneath us.
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(`${CONFIG_SECTION}.${PROFILES_KEY}`)) {
        provider.refresh();
      }
    }),

    // Feature: refresh the Changes tree when the open folder/workspace changes.
    vscode.workspace.onDidChangeWorkspaceFolders(() => changesProvider.refresh())
  );
}

// Runs once when the extension shuts down: cleans up the shared terminals.
function deactivate() {
  disposeSharedTerminal();
  disposeLogTerminal();
}

module.exports = { activate, deactivate };

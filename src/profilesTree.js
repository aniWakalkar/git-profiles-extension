const vscode = require('vscode');
const { getProfiles } = require('./config');

class GitProfilesTreeItem extends vscode.TreeItem {
  constructor(node, collapsibleState) {
    const label = node.type === 'profile' ? node.name : node.text;
    super(label, collapsibleState);
    this.node = node;

    if (node.type === 'profile') {
      this.contextValue = 'profile';
      this.iconPath = new vscode.ThemeIcon('git-branch');
      this.tooltip = 'Use the play button to run this profile\'s checked commands';
      // No .command here on purpose: clicking the row itself should only
      // expand/collapse it, not run anything. Running is the play button's job.
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

module.exports = { GitProfilesTreeItem, GitProfilesProvider };

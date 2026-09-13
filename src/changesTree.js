const vscode = require('vscode');
const path = require('path');
const { getWorkspaceRoot } = require('./gitExec');
const { getGitChanges } = require('./changes');
const { getBranches, isProtectedBranch } = require('./branches');

const CHANGE_STATUS_LABEL = { M: 'Modified', A: 'Added', D: 'Deleted', R: 'Renamed', C: 'Copied', U: 'Untracked' };

// Tree nodes:
//   group node -> { type: 'group', kind: 'staged'|'unstaged', label, count }
//   file node  -> { type: 'file', kind: 'staged'|'unstaged', filePath, code, staged, root }
//   message    -> { type: 'message', label }  (empty state / errors)

class GitChangeTreeItem extends vscode.TreeItem {
  constructor(node) {
    if (node.type === 'group') {
      super(`${node.label} (${node.count})`, vscode.TreeItemCollapsibleState.Expanded);
      this.contextValue = 'changeGroup';
    } else if (node.type === 'message') {
      super(node.label, vscode.TreeItemCollapsibleState.None);
      this.contextValue = 'changeMessage';
      this.iconPath = new vscode.ThemeIcon('info');
    } else {
      const base = path.basename(node.filePath);
      const dir = path.dirname(node.filePath);
      super(base, vscode.TreeItemCollapsibleState.None);
      this.description = dir === '.' ? '' : dir;
      this.tooltip = `${CHANGE_STATUS_LABEL[node.code] || node.code}: ${node.filePath}`;
      // resourceUri (instead of a custom iconPath) gives the real file-type
      // icon and lets VS Code's built-in Git decorations draw the M/A/D/U
      // status badge and color, matching the native Source Control view
      // instead of a second icon crowding the checkbox.
      this.resourceUri = vscode.Uri.file(path.join(node.root, node.filePath));
      this.contextValue = 'change';
      this.checkboxState = {
        state: node.staged ? vscode.TreeItemCheckboxState.Checked : vscode.TreeItemCheckboxState.Unchecked,
        tooltip: '',
      };
      this.command = {
        command: 'gitProfiles.openChangeDiff',
        title: 'Open Changes',
        arguments: [node],
      };
    }
    this.node = node;
  }
}

class GitChangesProvider {
  constructor() {
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    this.staged = [];
    this.unstaged = [];
    this.error = null;
    this.currentBranch = null;
    this.root = getWorkspaceRoot();
  }

  async refresh() {
    this.root = getWorkspaceRoot();
    if (!this.root) {
      this.staged = [];
      this.unstaged = [];
      this.error = null;
      this.currentBranch = null;
      this._onDidChangeTreeData.fire();
      return;
    }
    const result = await getGitChanges(this.root);
    this.staged = result.staged;
    this.unstaged = result.unstaged;
    this.error = result.error;
    try {
      this.currentBranch = (await getBranches(this.root)).current;
    } catch {
      this.currentBranch = null;
    }
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(node) {
    return new GitChangeTreeItem(node);
  }

  // Moves a single file between the in-memory staged/unstaged lists and
  // repaints immediately, so the checkbox flips the instant it's clicked
  // instead of waiting on a full `git status` round trip.
  moveFileLocally(filePath, toStaged) {
    const from = toStaged ? this.unstaged : this.staged;
    const to = toStaged ? this.staged : this.unstaged;
    const idx = from.findIndex((f) => f.filePath === filePath);
    if (idx === -1) return;
    const [entry] = from.splice(idx, 1);
    to.push(entry);
    this._onDidChangeTreeData.fire();
  }

  getChildren(node) {
    if (!node) {
      if (!this.root) return [{ type: 'message', label: 'Open a folder to see Git changes.' }];
      if (this.error) return [{ type: 'message', label: 'Not a Git repository, or Git was not found.' }];
      return [
        { type: 'group', kind: 'staged', label: 'Staged Changes', count: this.staged.length },
        { type: 'group', kind: 'unstaged', label: 'Changes', count: this.unstaged.length },
      ];
    }

    if (node.type === 'group') {
      const list = node.kind === 'staged' ? this.staged : this.unstaged;
      return list.map((f) => ({
        type: 'file',
        kind: node.kind,
        filePath: f.filePath,
        code: f.code,
        staged: node.kind === 'staged',
        root: this.root,
      }));
    }

    return [];
  }
}

module.exports = { GitChangeTreeItem, GitChangesProvider };

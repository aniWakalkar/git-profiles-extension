const vscode = require('vscode');

// -------------------- Git Actions result panel --------------------
// The "Git Actions" sidebar section otherwise has no content of its own --
// just the title-bar toolbar (Switch Branch, Pull, Show Commit History, etc).
// This gives
// it a small body: after "Pull" runs, its result (git's own summary --
// branch update info, "Already up to date.", the diffstat, or the error) is
// shown here as plain rows, right in this section, instead of a popup or a
// separate terminal panel.
//
// Tree nodes:
//   hint node    -> { type: 'hint', label }
//   summary node -> { type: 'summary', label, ok }
//   line node    -> { type: 'line', label }

class GitActionsTreeItem extends vscode.TreeItem {
  constructor(node) {
    super(node.label, vscode.TreeItemCollapsibleState.None);
    if (node.type === 'hint') {
      this.contextValue = 'actionsHint';
      this.iconPath = new vscode.ThemeIcon('info');
    } else if (node.type === 'summary') {
      this.contextValue = 'actionsSummary';
      this.iconPath = new vscode.ThemeIcon(node.ok ? 'check' : 'error');
    } else {
      this.contextValue = 'actionsLine';
    }
  }
}

class GitActionsProvider {
  constructor() {
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    this.pullResult = null; // { branch, ok, lines: string[] }
  }

  setPullResult(result) {
    this.pullResult = result;
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(node) {
    return new GitActionsTreeItem(node);
  }

  getChildren(node) {
    if (node) return [];
    if (!this.pullResult) {
      return [{ type: 'hint', label: 'Run "Pull" above to see the result here.' }];
    }
    const { branch, ok, lines } = this.pullResult;
    const summary = { type: 'summary', label: ok ? `Pulled "${branch}"` : `Pull failed on "${branch}"`, ok };
    return [summary, ...lines.map((label) => ({ type: 'line', label }))];
  }
}

module.exports = { GitActionsProvider };

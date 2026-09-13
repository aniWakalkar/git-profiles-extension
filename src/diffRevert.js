const vscode = require('vscode');
const path = require('path');
const { execGit } = require('./gitExec');
const { unstageFiles } = require('./changes');

// -------------------- diff / discard / revert-to-commit --------------------

// Virtual read-only documents for git object content, addressed as
// git-profiles-show:/<ref>?<filePath>, where ref is a commit-ish, "INDEX"
// (staged content) or "EMPTY" (side of a diff that doesn't exist, e.g. a
// brand-new or deleted file).
class GitShowContentProvider {
  constructor(getRoot) {
    this.getRoot = getRoot;
  }

  async provideTextDocumentContent(uri) {
    const ref = decodeURIComponent(uri.path.slice(1));
    if (ref === 'EMPTY') return '';
    const root = this.getRoot();
    if (!root) return '';
    const filePath = decodeURIComponent(uri.query);
    try {
      const spec = ref === 'INDEX' ? `:${filePath}` : `${ref}:${filePath}`;
      return await execGit(root, ['show', spec]);
    } catch {
      return '';
    }
  }
}

function gitShowUri(ref, filePath) {
  return vscode.Uri.parse(`git-profiles-show:/${encodeURIComponent(ref)}?${encodeURIComponent(filePath)}`);
}

async function openChangeDiff(node) {
  if (!node || node.type !== 'file') return;
  const { root, filePath, kind, code } = node;
  const fileName = path.basename(filePath);
  const noLeft = code === 'A' || code === 'U';
  const noRight = code === 'D';

  const leftUri = noLeft ? gitShowUri('EMPTY', filePath) : gitShowUri('HEAD', filePath);
  const rightUri = noRight
    ? gitShowUri('EMPTY', filePath)
    : kind === 'staged'
    ? gitShowUri('INDEX', filePath)
    : vscode.Uri.file(path.join(root, filePath));

  const title = `${fileName} (${kind === 'staged' ? 'Staged Changes' : 'Working Tree'})`;
  await vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, title);
}

async function discardChange(node) {
  if (!node || node.type !== 'file') return;
  const { root, filePath, code, kind } = node;
  const uri = vscode.Uri.file(path.join(root, filePath));

  if (code === 'U') {
    const confirm = await vscode.window.showWarningMessage(
      `Delete untracked file "${filePath}"? This cannot be undone.`,
      { modal: true },
      'Delete'
    );
    if (confirm !== 'Delete') return;
    try {
      await vscode.workspace.fs.delete(uri);
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to delete "${filePath}": ${err.message}`);
    }
    return;
  }

  const confirm = await vscode.window.showWarningMessage(
    `Discard changes in "${filePath}"? This reverts it to the last commit and cannot be undone.`,
    { modal: true },
    'Discard'
  );
  if (confirm !== 'Discard') return;

  try {
    if (kind === 'staged' && code === 'A') {
      // Newly added + staged: no HEAD version to check out, so unstage then remove.
      await execGit(root, ['reset', '--', filePath], `Unstage "${filePath}" before removing it (it's a new file)`);
      await vscode.workspace.fs.delete(uri);
    } else {
      await execGit(
        root,
        ['checkout', 'HEAD', '--', filePath],
        `Discard changes in "${filePath}", restoring it to the last commit`
      );
    }
  } catch (err) {
    vscode.window.showErrorMessage(`Git error: ${err.message}`);
  }
}

// Reverts every file that's currently checked (i.e. staged) back to HEAD in
// one go: check the files you want to throw away, then click Revert.
async function revertCheckedFiles(changesProvider) {
  const root = changesProvider.root;
  if (!root) return;

  const staged = changesProvider.staged;
  if (staged.length === 0) {
    vscode.window.showInformationMessage('No files are checked. Check the boxes next to the files you want to revert first.');
    return;
  }

  const confirm = await vscode.window.showWarningMessage(
    `Revert ${staged.length} file(s) to the last commit? This discards all uncommitted changes to them and cannot be undone.`,
    { modal: true },
    'Revert'
  );
  if (confirm !== 'Revert') return;

  const newFiles = staged.filter((f) => f.code === 'A').map((f) => f.filePath);
  const trackedFiles = staged.filter((f) => f.code !== 'A').map((f) => f.filePath);

  try {
    if (trackedFiles.length > 0) {
      await execGit(
        root,
        ['checkout', 'HEAD', '--', ...trackedFiles],
        `Revert ${trackedFiles.length} file(s) to the last commit`
      );
    }
    if (newFiles.length > 0) {
      await unstageFiles(root, newFiles);
      for (const filePath of newFiles) {
        try {
          await vscode.workspace.fs.delete(vscode.Uri.file(path.join(root, filePath)));
        } catch {
          // best-effort: file may already be gone
        }
      }
    }
    vscode.window.showInformationMessage(`Reverted ${staged.length} file(s).`);
  } catch (err) {
    vscode.window.showErrorMessage(`Git error: ${err.message}`);
  } finally {
    await changesProvider.refresh();
  }
}

async function revertFileToCommit(node) {
  if (!node || node.type !== 'file' || node.code === 'U') return;
  const { root, filePath } = node;

  let stdout;
  try {
    stdout = await execGit(root, ['log', '--follow', '--pretty=format:%H%x1f%ad%x1f%s', '--date=short', '--', filePath]);
  } catch (err) {
    vscode.window.showErrorMessage(`Git error: ${err.message}`);
    return;
  }
  if (!stdout.trim()) {
    vscode.window.showInformationMessage(`No commit history found for "${filePath}".`);
    return;
  }

  const commits = stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [hash, date, subject] = line.split('');
      return { hash, date, subject };
    });

  const picked = await vscode.window.showQuickPick(
    commits.map((c) => ({
      label: `$(git-commit) ${c.subject}`,
      description: c.hash.slice(0, 7),
      detail: c.date,
      hash: c.hash,
    })),
    { placeHolder: `Revert "${path.basename(filePath)}" to which commit?`, matchOnDescription: true, matchOnDetail: true }
  );
  if (!picked) return;

  const confirm = await vscode.window.showWarningMessage(
    `Revert "${filePath}" to commit ${picked.hash.slice(0, 7)}? Uncommitted changes to this file will be overwritten.`,
    { modal: true },
    'Revert'
  );
  if (confirm !== 'Revert') return;

  try {
    await execGit(
      root,
      ['checkout', picked.hash, '--', filePath],
      `Revert "${filePath}" to commit ${picked.hash.slice(0, 7)}`
    );
    vscode.window.showInformationMessage(
      `"${filePath}" reverted to ${picked.hash.slice(0, 7)}. Review it in Changes, then stage and commit.`
    );
  } catch (err) {
    vscode.window.showErrorMessage(`Git error: ${err.message}`);
  }
}

module.exports = {
  GitShowContentProvider,
  gitShowUri,
  openChangeDiff,
  discardChange,
  revertCheckedFiles,
  revertFileToCommit,
};

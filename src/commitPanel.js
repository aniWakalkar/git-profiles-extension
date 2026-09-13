const vscode = require('vscode');
const path = require('path');
const { execGit } = require('./gitExec');
const { getGitChanges, stageFiles, unstageFiles } = require('./changes');
const { getBranches, isProtectedBranch, performMerge } = require('./branches');
const { escapeHtml } = require('./htmlUtils');

function getCommitHtml(initialFiles, currentBranch, mergeTargets) {
  const nonce = String(Date.now());
  const filesJson = JSON.stringify(initialFiles);
  const mergeTargetsJson = JSON.stringify(mergeTargets);

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
  * {
    box-sizing: border-box;
  }
  body {
    font-family: var(--vscode-font-family);
    color: var(--vscode-foreground);
    padding: 20px 24px;
  }
  h3 {
    margin: 0 0 8px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    opacity: 0.7;
    font-weight: 600;
  }
  .file-list {
    border: 1px solid var(--vscode-input-border, #444);
    border-radius: 4px;
    max-height: 240px;
    overflow-y: auto;
    margin-bottom: 18px;
  }
  .file-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 8px;
    cursor: pointer;
  }
  .file-row:hover {
    background: var(--vscode-list-hoverBackground, rgba(128,128,128,0.15));
  }
  .file-row input[type="checkbox"],
  .select-all-row input[type="checkbox"] {
    margin: 0;
    flex-shrink: 0;
    width: 14px;
    height: 14px;
  }
  .file-status {
    opacity: 0.6;
    width: 14px;
    text-align: center;
    flex-shrink: 0;
    font-family: var(--vscode-editor-font-family);
    font-size: 12px;
  }
  .file-path {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    font-family: var(--vscode-editor-font-family);
    font-size: 13px;
  }
  .empty {
    padding: 10px 8px;
    opacity: 0.6;
    font-size: 12px;
  }
  textarea {
    width: 100%;
    box-sizing: border-box;
    min-height: 80px;
    padding: 8px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 3px;
    font-family: var(--vscode-font-family);
    resize: vertical;
  }
  .select-all-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 8px;
    border-bottom: 1px solid var(--vscode-input-border, #444);
  }
  .select-all-row label {
    cursor: pointer;
    font-weight: 600;
    font-size: 12px;
  }
  .current-branch-display {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 10px;
    background: var(--vscode-list-inactiveSelectionBackground, rgba(128,128,128,0.15));
    border-radius: 3px;
    font-family: var(--vscode-editor-font-family);
    font-size: 13px;
    font-weight: 600;
  }
  .push-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 14px;
  }
  .push-row label {
    cursor: pointer;
  }
  .push-row input:disabled + label {
    opacity: 0.6;
  }
  #mergeSection {
    margin-top: 10px;
  }
  #mergeTargetList .file-row .lock {
    opacity: 0.7;
    flex-shrink: 0;
    font-size: 12px;
  }
  .msg {
    font-size: 12px;
    margin-top: 10px;
    min-height: 16px;
  }
  .msg.error {
    color: var(--vscode-errorForeground);
  }
  .msg.success {
    color: var(--vscode-terminal-ansiGreen, #89d185);
  }
  #progressSection {
    margin-top: 18px;
    border: 1px solid var(--vscode-input-border, #444);
    border-radius: 4px;
    padding: 4px 0;
  }
  .step-row {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 6px 10px;
    font-size: 13px;
  }
  .step-row.sub {
    padding-left: 30px;
    font-size: 12px;
    opacity: 0.9;
  }
  .step-icon {
    flex-shrink: 0;
    width: 16px;
  }
  .step-label {
    flex: 1;
  }
  .step-row.error .step-label,
  .step-row.error .step-detail {
    color: var(--vscode-errorForeground);
  }
  .step-row.success .step-label {
    color: var(--vscode-terminal-ansiGreen, #89d185);
  }
  .step-detail {
    opacity: 0.75;
    font-size: 12px;
  }
  .actions {
    display: flex;
    gap: 10px;
    margin-top: 10px;
  }
  .actions.commit-actions {
    margin-top: 22px;
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
  button.primary:disabled {
    opacity: 0.6;
    cursor: default;
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
</style>
</head>
<body>
  <h3>Branch</h3>
  <div class="current-branch-display">🌿 ${escapeHtml(currentBranch)}</div>

  <h3 style="margin-top: 22px;">Files</h3>
  <div class="file-list">
    <div class="select-all-row">
      <input type="checkbox" id="selectAll" />
      <label for="selectAll">Select All</label>
    </div>
    <div id="fileList"></div>
  </div>
  <div class="actions">
    <button class="secondary" id="applyStageBtn">Apply Stage</button>
  </div>

  <h3 style="margin-top: 22px;">Commit Message</h3>
  <textarea id="message" placeholder="Describe your changes..." autofocus></textarea>

  <div class="push-row">
    <input type="checkbox" id="pushToggle" />
    <label for="pushToggle">Push after commit</label>
  </div>

  <div class="push-row">
    <input type="checkbox" id="mergeToggle" />
    <label for="mergeToggle">Also merge into other branches after pushing</label>
  </div>

  <div id="mergeSection" hidden>
    <h3>Merge Into</h3>
    <div class="file-list" id="mergeTargetList"></div>
  </div>

  <div class="msg" id="msgEl"></div>

  <div id="progressSection" hidden>
    <h3 style="margin-top: 0;">Result</h3>
    <div id="stepList"></div>
  </div>

  <div class="actions commit-actions">
    <button class="primary" id="commitBtn">Commit</button>
    <button class="secondary" id="cancelBtn">Cancel</button>
  </div>

<script nonce="${nonce}">
  const vscodeApi = acquireVsCodeApi();
  // f.staged here is the desired checkbox state, which may not be applied to
  // git yet -- "Apply Stage" (or Commit, which applies pending changes too)
  // is what actually runs git add/reset.
  let files = ${filesJson};
  const mergeTargets = ${mergeTargetsJson};

  const listEl = document.getElementById('fileList');
  const selectAllEl = document.getElementById('selectAll');
  const messageEl = document.getElementById('message');
  const msgEl = document.getElementById('msgEl');
  const commitBtn = document.getElementById('commitBtn');
  const applyStageBtn = document.getElementById('applyStageBtn');
  const pushToggleEl = document.getElementById('pushToggle');
  const mergeToggleEl = document.getElementById('mergeToggle');
  const mergeSectionEl = document.getElementById('mergeSection');
  const mergeTargetListEl = document.getElementById('mergeTargetList');
  const progressSectionEl = document.getElementById('progressSection');
  const stepListEl = document.getElementById('stepList');
  const cancelBtn = document.getElementById('cancelBtn');

  function setMsg(text, kind) {
    msgEl.textContent = text || '';
    msgEl.className = 'msg' + (kind ? ' ' + kind : '');
  }

  // Live per-step results (Commit / Push / Merge) so it's always visible
  // right here what actually happened -- not just a toast that disappears.
  const stepEls = new Map();
  const statusIcon = { pending: '⏳', success: '✅', error: '❌' };

  function ensureStep(id, label, sub) {
    if (stepEls.has(id)) return stepEls.get(id);
    const row = document.createElement('div');
    row.className = 'step-row' + (sub ? ' sub' : '');
    const icon = document.createElement('span');
    icon.className = 'step-icon';
    const text = document.createElement('span');
    text.className = 'step-label';
    text.textContent = label;
    const detail = document.createElement('span');
    detail.className = 'step-detail';
    row.appendChild(icon);
    row.appendChild(text);
    row.appendChild(detail);
    stepListEl.appendChild(row);
    const entry = { row, icon, detail };
    stepEls.set(id, entry);
    return entry;
  }

  function setStepStatus(id, status, detailText) {
    const entry = stepEls.get(id);
    if (!entry) return;
    entry.icon.textContent = statusIcon[status] || '';
    entry.row.className = entry.row.className.replace(/\b(pending|success|error)\b/g, '').trim() + ' ' + status;
    entry.detail.textContent = detailText || '';
  }

  function renderMergeTargets() {
    mergeTargetListEl.innerHTML = '';
    if (mergeTargets.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'No other local branches to merge into.';
      mergeTargetListEl.appendChild(empty);
      return;
    }
    mergeTargets.forEach((t) => {
      const row = document.createElement('label');
      row.className = 'file-row';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.dataset.branch = t.branch;

      const name = document.createElement('span');
      name.className = 'file-path';
      name.textContent = t.branch;

      row.appendChild(cb);
      if (t.protected) {
        const lock = document.createElement('span');
        lock.className = 'lock';
        lock.textContent = '🔒';
        lock.title = 'Protected branch — opens a pull request instead of merging directly';
        row.appendChild(lock);
      }
      row.appendChild(name);
      mergeTargetListEl.appendChild(row);
    });
  }
  renderMergeTargets();

  // Merging only makes sense after the commit is on the remote, so turning
  // it on forces (and locks) "Push after commit" too.
  mergeToggleEl.addEventListener('change', () => {
    mergeSectionEl.hidden = !mergeToggleEl.checked;
    if (mergeToggleEl.checked) {
      pushToggleEl.checked = true;
      pushToggleEl.disabled = true;
    } else {
      pushToggleEl.disabled = false;
    }
  });

  // Commit stays disabled until there's an actual commit message.
  function updateCommitButtonState() {
    commitBtn.disabled = messageEl.value.trim().length === 0;
  }
  messageEl.addEventListener('input', updateCommitButtonState);
  updateCommitButtonState();

  function updateSelectAllState() {
    const allChecked = files.length > 0 && files.every((f) => f.staged);
    const someChecked = files.some((f) => f.staged);
    selectAllEl.checked = allChecked;
    selectAllEl.indeterminate = !allChecked && someChecked;
    selectAllEl.disabled = files.length === 0;
  }

  function render() {
    listEl.innerHTML = '';
    if (files.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'No changes.';
      listEl.appendChild(empty);
      updateSelectAllState();
      return;
    }
    files.forEach((f) => {
      const row = document.createElement('label');
      row.className = 'file-row';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = f.staged;
      cb.addEventListener('change', () => {
        f.staged = cb.checked;
        updateSelectAllState();
      });

      const status = document.createElement('span');
      status.className = 'file-status';
      status.textContent = f.code;

      const p = document.createElement('span');
      p.className = 'file-path';
      p.textContent = f.filePath;
      p.title = f.filePath;

      row.appendChild(cb);
      row.appendChild(status);
      row.appendChild(p);
      listEl.appendChild(row);
    });
    updateSelectAllState();
  }
  render();

  selectAllEl.addEventListener('change', () => {
    const checked = selectAllEl.checked;
    files.forEach((f) => (f.staged = checked));
    render();
  });

  applyStageBtn.addEventListener('click', () => {
    setMsg('', null);
    applyStageBtn.disabled = true;
    vscodeApi.postMessage({
      type: 'applyStage',
      files: files.map((f) => ({ filePath: f.filePath, staged: f.staged })),
    });
  });

  commitBtn.addEventListener('click', () => {
    const message = messageEl.value;
    const push = pushToggleEl.checked;
    const merge = mergeToggleEl.checked;
    const mergeTargetBranches = merge
      ? Array.from(mergeTargetListEl.querySelectorAll('input[type="checkbox"]:checked')).map((cb) => cb.dataset.branch)
      : [];
    setMsg('', null);
    commitBtn.disabled = true;
    stepEls.clear();
    stepListEl.innerHTML = '';
    progressSectionEl.hidden = false;
    vscodeApi.postMessage({
      type: 'commit',
      message,
      push,
      merge,
      mergeTargets: mergeTargetBranches,
      files: files.map((f) => ({ filePath: f.filePath, staged: f.staged })),
    });
  });

  cancelBtn.addEventListener('click', () => {
    vscodeApi.postMessage({ type: 'cancel' });
  });

  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg.type === 'error') {
      setMsg(msg.text, 'error');
      updateCommitButtonState();
      applyStageBtn.disabled = false;
    } else if (msg.type === 'filesUpdated') {
      files = msg.files;
      render();
      updateCommitButtonState();
      applyStageBtn.disabled = false;
      if (msg.success) setMsg(msg.success, 'success');
    } else if (msg.type === 'stepStart') {
      ensureStep(msg.id, msg.label, msg.sub);
      setStepStatus(msg.id, 'pending');
    } else if (msg.type === 'stepDone') {
      setStepStatus(msg.id, msg.status, msg.detail);
    } else if (msg.type === 'mergeResults') {
      msg.results.forEach((r) => {
        const id = 'merge-' + r.branch;
        const label =
          r.status === 'pr'
            ? 'Pull request opened for "' + r.branch + '"'
            : 'Merged into "' + r.branch + '"';
        ensureStep(id, label, true);
        setStepStatus(id, r.status === 'failed' ? 'error' : 'success', r.detail);
      });
    } else if (msg.type === 'flowDone') {
      commitBtn.hidden = true;
      cancelBtn.textContent = 'Close';
    }
  });
</script>
</body>
</html>`;
}

async function openCommitPanel(changesProvider) {
  const root = changesProvider.root;
  if (!root) {
    vscode.window.showWarningMessage('Open a folder to commit changes.');
    return;
  }

  const status = await getGitChanges(root);
  if (status.error) {
    vscode.window.showErrorMessage(status.error);
    return;
  }

  let branchInfo;
  try {
    branchInfo = await getBranches(root);
  } catch (err) {
    vscode.window.showErrorMessage(`Git error: ${err.message}`);
    return;
  }

  const files = [
    ...status.staged.map((f) => ({ filePath: f.filePath, code: f.code, staged: true })),
    ...status.unstaged.map((f) => ({ filePath: f.filePath, code: f.code, staged: false })),
  ];

  const mergeTargets = branchInfo.branches
    .filter((b) => b !== branchInfo.current)
    .map((b) => ({ branch: b, protected: isProtectedBranch(b) }));

  const panel = vscode.window.createWebviewPanel(
    'gitProfilesCommit',
    'Commit Changes',
    vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: false }
  );
  panel.webview.html = getCommitHtml(files, branchInfo.current, mergeTargets);

  // Applies the webview's desired staged/unstaged state to git: diffs it
  // against the real current status and runs a batched add/reset for
  // whatever changed. Returns the refreshed file list, or null on error
  // (having already posted the error to the webview).
  async function applyDesiredStage(desired) {
    const current = await getGitChanges(root);
    if (current.error) {
      panel.webview.postMessage({ type: 'error', text: current.error });
      return null;
    }
    const stagedPaths = new Set(current.staged.map((f) => f.filePath));
    const toStage = desired.filter((f) => f.staged && !stagedPaths.has(f.filePath)).map((f) => f.filePath);
    const toUnstage = desired.filter((f) => !f.staged && stagedPaths.has(f.filePath)).map((f) => f.filePath);

    if (toStage.length > 0) await stageFiles(root, toStage);
    if (toUnstage.length > 0) await unstageFiles(root, toUnstage);

    const refreshed = await getGitChanges(root);
    changesProvider.refresh();
    if (refreshed.error) {
      panel.webview.postMessage({ type: 'error', text: refreshed.error });
      return null;
    }
    return refreshed;
  }

  panel.webview.onDidReceiveMessage(async (message) => {
    if (message.type === 'cancel') {
      panel.dispose();
      return;
    }

    if (message.type === 'applyStage') {
      let refreshed;
      try {
        refreshed = await applyDesiredStage(message.files);
      } catch (err) {
        panel.webview.postMessage({ type: 'error', text: `Git error: ${err.message}` });
        return;
      }
      if (!refreshed) return;
      const files = [
        ...refreshed.staged.map((f) => ({ filePath: f.filePath, code: f.code, staged: true })),
        ...refreshed.unstaged.map((f) => ({ filePath: f.filePath, code: f.code, staged: false })),
      ];
      panel.webview.postMessage({ type: 'filesUpdated', files, success: 'Staging updated.' });
      return;
    }

    if (message.type === 'commit') {
      const trimmed = (message.message || '').trim();
      if (!trimmed) {
        panel.webview.postMessage({ type: 'error', text: 'Commit message cannot be empty.' });
        return;
      }

      let current;
      try {
        current = await applyDesiredStage(message.files);
      } catch (err) {
        panel.webview.postMessage({ type: 'error', text: `Git error: ${err.message}` });
        return;
      }
      if (!current) return;
      if (current.staged.length === 0) {
        panel.webview.postMessage({ type: 'error', text: 'No staged files to commit. Check at least one file above.' });
        return;
      }

      // Always commits to whatever branch is currently checked out -- this
      // panel has no way to switch branches, on purpose, so you can never
      // accidentally commit/push to the wrong one.
      let currentBranch;
      try {
        currentBranch = (await getBranches(root)).current;
      } catch (err) {
        panel.webview.postMessage({ type: 'error', text: `Git error: ${err.message}` });
        return;
      }

      // Each step reports its own live pending -> success/error result into
      // the panel as it happens, instead of one final toast at the end that
      // doesn't say which part (commit/push/merge) actually succeeded.
      panel.webview.postMessage({ type: 'stepStart', id: 'commit', label: `Commit ${current.staged.length} file(s)` });
      try {
        await execGit(root, ['commit', '-m', trimmed], `Commit staged changes with message: "${trimmed}"`);
        panel.webview.postMessage({ type: 'stepDone', id: 'commit', status: 'success' });
      } catch (err) {
        panel.webview.postMessage({ type: 'stepDone', id: 'commit', status: 'error', detail: err.message });
        panel.webview.postMessage({ type: 'flowDone' });
        await changesProvider.refresh();
        return;
      }

      if (message.push) {
        panel.webview.postMessage({ type: 'stepStart', id: 'push', label: 'Push to remote' });
        try {
          // Plain "git push" fails with "no upstream branch" the first time a
          // branch is pushed. -u origin <branch> sets that up if needed and
          // behaves like a normal push on every push after that.
          await execGit(root, ['push', '-u', 'origin', currentBranch], 'Push committed changes to the remote');
          panel.webview.postMessage({ type: 'stepDone', id: 'push', status: 'success' });
        } catch (err) {
          panel.webview.postMessage({ type: 'stepDone', id: 'push', status: 'error', detail: err.message });
          panel.webview.postMessage({ type: 'flowDone' });
          await changesProvider.refresh();
          return;
        }
      }

      if (message.merge && Array.isArray(message.mergeTargets) && message.mergeTargets.length > 0) {
        panel.webview.postMessage({
          type: 'stepStart',
          id: 'merge',
          label: `Merge into ${message.mergeTargets.length} branch(es)`,
        });
        try {
          const mergeResult = await performMerge(root, currentBranch, message.mergeTargets, currentBranch);
          panel.webview.postMessage({
            type: 'stepDone',
            id: 'merge',
            status: mergeResult.failed.length > 0 ? 'error' : 'success',
            detail: mergeResult.failed.length > 0 ? `${mergeResult.failed.length} failed` : undefined,
          });
          panel.webview.postMessage({
            type: 'mergeResults',
            results: [
              ...mergeResult.merged.map((branch) => ({ branch, status: 'merged' })),
              ...mergeResult.prOpened.map((branch) => ({ branch, status: 'pr' })),
              ...mergeResult.failed.map((f) => ({ branch: f.target, status: 'failed', detail: f.reason })),
            ],
          });
        } catch (err) {
          panel.webview.postMessage({ type: 'stepDone', id: 'merge', status: 'error', detail: err.message });
        }
      }

      panel.webview.postMessage({ type: 'flowDone' });
      await changesProvider.refresh();
    }
  });
}

module.exports = { openCommitPanel };

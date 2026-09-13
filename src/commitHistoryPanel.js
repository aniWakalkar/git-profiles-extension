const vscode = require('vscode');
const os = require('os');
const path = require('path');
const { execGit } = require('./gitExec');
const { getBranches } = require('./branches');
const { gitShowUri } = require('./diffRevert');
const { escapeHtml } = require('./htmlUtils');

// -------------------- commit history --------------------

// Same "who am I" heuristic used elsewhere: git config first, falling back
// to the OS account name (matched against commit emails) when git identity
// isn't configured on this machine at all.
async function getMyIdentity(root) {
  let email = '';
  let name = '';
  try {
    email = (await execGit(root, ['config', 'user.email'])).trim();
  } catch {
    // not configured
  }
  try {
    name = (await execGit(root, ['config', 'user.name'])).trim();
  } catch {
    // not configured
  }
  let usernameFallback = '';
  if (!email && !name) {
    try {
      usernameFallback = os.userInfo().username.trim().toLowerCase();
    } catch {
      // couldn't read the OS username either
    }
  }
  return { email, name, usernameFallback };
}

// `git log --author=X` (multiple --author flags are OR'd together by git)
// matches against "Name <email>", so email/name/username-fallback all work
// as independent alternatives here.
function buildAuthorFilters(identity) {
  const filters = [];
  if (identity.email) filters.push(`--author=${identity.email}`);
  if (identity.name) filters.push(`--author=${identity.name}`);
  if (identity.usernameFallback) filters.push(`--author=${identity.usernameFallback}`);
  return filters;
}

function parseLogLines(stdout) {
  return stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [hash, author, email, date, subject] = line.split('\x1f');
      return { hash, author, email, date, subject };
    });
}

function matchesIdentity(commit, identity) {
  const terms = [identity.email, identity.name, identity.usernameFallback].filter(Boolean).map((s) => s.toLowerCase());
  if (terms.length === 0) return true;
  const author = (commit.author || '').toLowerCase();
  const email = (commit.email || '').toLowerCase();
  return terms.some((t) => author.includes(t) || email.includes(t));
}

// %aN/%aE (capital N/E) are the mailmap-resolved author name/email, as
// opposed to %an/%ae which are whatever was literally recorded in the
// commit. If a `.mailmap` file exists at the repo root mapping alternate
// names/emails to one canonical identity, git normalizes them here for
// free -- with no mailmap present, %aN/%aE behave exactly like %an/%ae, so
// this is a no-op until one is added.
const LOG_FORMAT = '%H%x1f%aN%x1f%aE%x1f%ad%x1f%s';
const DATE_ARG = '--date=format:%Y-%m-%d %H:%M';

// `git log <branch>` alone shows every ancestor commit reachable from that
// branch's tip -- including everything it ever merged in from other
// branches, since git history is a shared DAG, not per-branch exclusive.
// To show only commits made on THIS branch (i.e. added since it diverged),
// we need the commit it pointed to right when it was created, then take
// everything after that.
//
// Reachability-based exclusion ("show commits not reachable from any other
// branch") looks like the right tool for this but is provably wrong: the
// moment this branch gets merged INTO another branch, its own commits
// become reachable from that other branch too, so they'd disappear from
// its own view -- exactly backwards, and exactly what happens to a feature
// branch after it ships. `--first-parent` doesn't rescue this either, since
// --not's ancestor-marking still walks every parent regardless.
//
// The fix is `git reflog`, which is local-only and records every time a
// branch ref moved on THIS machine -- including a "branch: Created from X"
// entry at creation time. That entry's commit is a fixed historical point,
// unaffected by anything merged in later. Its oldest reflog entry is that
// creation point.
//
// Reflog entries expire (~90 days by default) and never travel with a clone
// or push -- on a fresh clone, a branch's reflog holds exactly one entry
// ("branch: Created from origin/X" or "clone: from ..."), and it points at
// the branch's CURRENT tip, not its true history start (the clone never saw
// the branch move). Trusting that single entry would make an old branch
// with real commits look completely empty on anyone else's checkout, which
// is worse than not filtering at all. So a lone entry is treated the same
// as no reflog: creation point unknown, and the caller falls back to the
// plain (full-ancestry) branch log instead.
async function getBranchCreationPoint(root, branch) {
  try {
    const stdout = await execGit(root, ['log', '-g', '--format=%H', `refs/heads/${branch}`]);
    const lines = stdout.split('\n').filter(Boolean);
    return lines.length > 1 ? lines[lines.length - 1] : null;
  } catch {
    return null;
  }
}

async function branchExclusiveRevArgs(root, branch) {
  const creationPoint = await getBranchCreationPoint(root, branch);
  return creationPoint ? [`${creationPoint}..${branch}`] : [branch];
}

// Git can't OR a message match against an author match in one `git log` call
// (--grep and --author are AND'd together, and stacking multiple --author
// flags ORs them -- there's no way to AND "matches my identity" with
// "matches the typed search text" using --author alone). So when free-text
// search is active we run one query per field, unrestricted by identity, and
// merge the results ourselves -- then apply "only my commits" as our own
// post-filter. This is what lets typing part of your own name (e.g. "wak"
// for "wakaa") still find your commits even when the checkbox is on, and
// lets the same box find other people's commits by name once it's off.
//
// `--no-merges` drops merge commits (anything with 2+ parents) from the log
// entirely -- those are noise here since they don't represent a person's own
// change, just two branches being combined.
//
// Returns { commits, hasMore }: one extra row beyond `limit` is fetched (and
// trimmed off) purely to know whether a next page exists, so the "Load More"
// button can be hidden instead of always showing regardless of whether
// there's anything left.
async function getCommitLog(root, branch, { limit = 100, skip = 0, onlyMine = false, identity = null, search = '' } = {}) {
  const trimmedSearch = (search || '').trim();
  const revArgs = await branchExclusiveRevArgs(root, branch);

  if (trimmedSearch) {
    const baseArgs = ['log', ...revArgs, '--no-merges', `--pretty=format:${LOG_FORMAT}`, DATE_ARG, '-i', '-F', '-n2000'];

    const byMessage = parseLogLines(await execGit(root, [...baseArgs, `--grep=${trimmedSearch}`]));
    const byAuthor = parseLogLines(await execGit(root, [...baseArgs, `--author=${trimmedSearch}`]));

    const merged = new Map();
    [...byMessage, ...byAuthor].forEach((c) => merged.set(c.hash, c));
    let all = Array.from(merged.values());

    if (onlyMine && identity) {
      all = all.filter((c) => matchesIdentity(c, identity));
    }

    all.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    const page = all.slice(skip, skip + limit + 1);
    const hasMore = page.length > limit;
    return { commits: page.slice(0, limit), hasMore };
  }

  const args = ['log', ...revArgs, '--no-merges', `--pretty=format:${LOG_FORMAT}`, DATE_ARG, `-n${limit + 1}`, `--skip=${skip}`];
  if (onlyMine && identity) {
    args.push(...buildAuthorFilters(identity));
  }
  const stdout = await execGit(root, args);
  const page = parseLogLines(stdout);
  const hasMore = page.length > limit;
  return { commits: page.slice(0, limit), hasMore };
}

async function getCommitFiles(root, hash) {
  const stdout = await execGit(root, ['diff-tree', '--no-commit-id', '--name-status', '-r', hash]);
  return stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const parts = line.split('\t');
      return { code: parts[0][0], filePath: parts[parts.length - 1] };
    });
}

function getHistoryHtml(branches, currentBranch, initialCommits, initialHasMore) {
  const nonce = String(Date.now());
  const branchOptions = branches
    .map((b) => `<option value="${escapeHtml(b)}"${b === currentBranch ? ' selected' : ''}>${escapeHtml(b)}</option>`)
    .join('');
  const commitsJson = JSON.stringify(initialCommits);
  const hasMoreJson = JSON.stringify(!!initialHasMore);

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
  select#branchSelect {
    width: 100%;
    padding: 6px 8px;
    background: var(--vscode-dropdown-background, var(--vscode-input-background));
    color: var(--vscode-dropdown-foreground, var(--vscode-input-foreground));
    border: 1px solid var(--vscode-dropdown-border, var(--vscode-input-border, #444));
    border-radius: 3px;
    font-family: var(--vscode-font-family);
    font-size: 13px;
  }
  .commit-list {
    margin-top: 6px;
    border: 1px solid var(--vscode-input-border, #444);
    border-radius: 4px;
  }
  .commit-row {
    border-bottom: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.15));
  }
  .commit-row:last-child {
    border-bottom: none;
  }
  .commit-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 8px;
    cursor: pointer;
  }
  .commit-header:hover {
    background: var(--vscode-list-hoverBackground, rgba(128,128,128,0.15));
  }
  .chevron {
    width: 12px;
    flex-shrink: 0;
    opacity: 0.7;
    font-size: 11px;
    transition: transform 0.1s;
  }
  .chevron.open {
    transform: rotate(90deg);
  }
  .commit-subject {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
  }
  .commit-meta {
    flex-shrink: 0;
    opacity: 0.6;
    font-size: 11.5px;
    font-family: var(--vscode-editor-font-family);
  }
  .commit-files {
    padding: 2px 8px 8px 34px;
  }
  .commit-files.hidden {
    display: none;
  }
  .commit-file {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 3px 4px;
    cursor: pointer;
    border-radius: 3px;
    font-family: var(--vscode-editor-font-family);
    font-size: 12.5px;
  }
  .commit-file:hover {
    background: var(--vscode-list-hoverBackground, rgba(128,128,128,0.15));
  }
  .commit-file .status {
    width: 14px;
    text-align: center;
    opacity: 0.7;
    flex-shrink: 0;
  }
  .commit-file .path {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .empty,
  .loading {
    padding: 8px 4px;
    opacity: 0.6;
    font-size: 12px;
  }
  #loadMoreBtn {
    margin-top: 12px;
    background: transparent;
    border: 1px dashed var(--vscode-input-border, #888);
    color: var(--vscode-foreground);
    padding: 6px 12px;
    border-radius: 3px;
    cursor: pointer;
    width: 100%;
  }
  #loadMoreBtn:hover {
    background: var(--vscode-toolbar-hoverBackground, rgba(128,128,128,0.15));
  }
  #loadMoreBtn:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .icon-btn {
    background: transparent;
    border: none;
    color: var(--vscode-foreground);
    opacity: 0.7;
    cursor: pointer;
    font-size: 13px;
    line-height: 1;
    padding: 3px 6px;
    border-radius: 3px;
    flex-shrink: 0;
  }
  .icon-btn:hover {
    opacity: 1;
    background: var(--vscode-toolbar-hoverBackground, rgba(128,128,128,0.2));
  }
  .mine-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 12px;
  }
  .mine-row label {
    cursor: pointer;
  }
  input#searchInput {
    width: 100%;
    margin-top: 12px;
    padding: 6px 8px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, #444);
    border-radius: 3px;
    font-family: var(--vscode-font-family);
    font-size: 13px;
  }
  input#searchInput::placeholder {
    color: var(--vscode-input-placeholderForeground, rgba(128,128,128,0.8));
  }
</style>
</head>
<body>
  <h3>Branch</h3>
  <select id="branchSelect">${branchOptions}</select>

  <div class="mine-row">
    <input type="checkbox" id="onlyMineToggle" checked />
    <label for="onlyMineToggle">Only show my commits</label>
  </div>

  <input type="text" id="searchInput" placeholder="Search by commit message or author..." />

  <h3 style="margin-top: 20px;">Commits</h3>
  <div class="commit-list" id="commitList"></div>
  <button id="loadMoreBtn">Load 100 More</button>

<script nonce="${nonce}">
  const vscodeApi = acquireVsCodeApi();
  const branchSelectEl = document.getElementById('branchSelect');
  const onlyMineToggleEl = document.getElementById('onlyMineToggle');
  const searchInputEl = document.getElementById('searchInput');
  const listEl = document.getElementById('commitList');
  const loadMoreBtn = document.getElementById('loadMoreBtn');

  let commits = ${commitsJson};
  let hasMore = ${hasMoreJson};
  const fileCache = new Map(); // hash -> files[] | 'loading'
  const openHashes = new Set();
  loadMoreBtn.hidden = !hasMore;

  function statusLabel(code) {
    return { M: 'M', A: 'A', D: 'D', R: 'R', C: 'C' }[code] || code;
  }

  function render() {
    listEl.innerHTML = '';
    if (commits.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      const searchActive = searchInputEl.value.trim().length > 0;
      if (searchActive) {
        empty.textContent = 'No commits match "' + searchInputEl.value.trim() + '"' +
          (onlyMineToggleEl.checked ? ' among your commits. Uncheck "Only show my commits" to search everyone\\'s.' : '.');
      } else {
        empty.textContent = onlyMineToggleEl.checked
          ? 'No commits by you found on this branch. Uncheck "Only show my commits" to see everyone\\'s.'
          : 'No commits on this branch.';
      }
      listEl.appendChild(empty);
      return;
    }

    commits.forEach((c) => {
      const row = document.createElement('div');
      row.className = 'commit-row';

      const header = document.createElement('div');
      header.className = 'commit-header';

      const chevron = document.createElement('span');
      chevron.className = 'chevron' + (openHashes.has(c.hash) ? ' open' : '');
      chevron.textContent = '▸';

      const subject = document.createElement('span');
      subject.className = 'commit-subject';
      subject.textContent = c.subject;
      subject.title = c.subject;

      const meta = document.createElement('span');
      meta.className = 'commit-meta';
      meta.textContent = c.hash.slice(0, 7) + ' · ' + c.date + ' · ' + c.author;

      const revertCommitBtn = document.createElement('button');
      revertCommitBtn.className = 'icon-btn';
      revertCommitBtn.title = 'Revert this commit (creates a new commit that undoes it)';
      revertCommitBtn.textContent = '↺';
      revertCommitBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        vscodeApi.postMessage({ type: 'revertCommit', hash: c.hash, subject: c.subject });
      });

      header.appendChild(chevron);
      header.appendChild(subject);
      header.appendChild(meta);
      header.appendChild(revertCommitBtn);

      const filesEl = document.createElement('div');
      filesEl.className = 'commit-files' + (openHashes.has(c.hash) ? '' : ' hidden');
      renderFiles(filesEl, c.hash);

      header.addEventListener('click', () => {
        if (openHashes.has(c.hash)) {
          openHashes.delete(c.hash);
        } else {
          openHashes.add(c.hash);
          if (!fileCache.has(c.hash)) {
            fileCache.set(c.hash, 'loading');
            vscodeApi.postMessage({ type: 'getCommitFiles', hash: c.hash });
          }
        }
        chevron.classList.toggle('open');
        filesEl.classList.toggle('hidden');
        renderFiles(filesEl, c.hash);
      });

      row.appendChild(header);
      row.appendChild(filesEl);
      listEl.appendChild(row);
    });
  }

  function renderFiles(container, hash) {
    const cached = fileCache.get(hash);
    container.innerHTML = '';
    if (cached === undefined) return;
    if (cached === 'loading') {
      const loading = document.createElement('div');
      loading.className = 'loading';
      loading.textContent = 'Loading files…';
      container.appendChild(loading);
      return;
    }
    if (cached.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'No files (empty commit).';
      container.appendChild(empty);
      return;
    }
    cached.forEach((f) => {
      const row = document.createElement('div');
      row.className = 'commit-file';

      const status = document.createElement('span');
      status.className = 'status';
      status.textContent = statusLabel(f.code);

      const p = document.createElement('span');
      p.className = 'path';
      p.textContent = f.filePath;
      p.title = f.filePath;

      const revertFileBtn = document.createElement('button');
      revertFileBtn.className = 'icon-btn';
      revertFileBtn.title = 'Revert this file to how it was in this commit';
      revertFileBtn.textContent = '↺';
      revertFileBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        vscodeApi.postMessage({ type: 'revertFile', hash, filePath: f.filePath });
      });

      row.appendChild(status);
      row.appendChild(p);
      row.appendChild(revertFileBtn);
      row.addEventListener('click', () => {
        vscodeApi.postMessage({ type: 'openFileDiff', hash, filePath: f.filePath });
      });
      container.appendChild(row);
    });
  }

  render();

  function refetchCommits() {
    commits = [];
    fileCache.clear();
    openHashes.clear();
    loadMoreBtn.disabled = true;
    loadMoreBtn.hidden = true;
    render();
    vscodeApi.postMessage({
      type: 'branchChanged',
      branch: branchSelectEl.value,
      onlyMine: onlyMineToggleEl.checked,
      search: searchInputEl.value,
    });
  }
  branchSelectEl.addEventListener('change', refetchCommits);
  onlyMineToggleEl.addEventListener('change', refetchCommits);

  let searchDebounceTimer = null;
  searchInputEl.addEventListener('input', () => {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(refetchCommits, 300);
  });

  loadMoreBtn.addEventListener('click', () => {
    loadMoreBtn.disabled = true;
    vscodeApi.postMessage({
      type: 'loadMore',
      branch: branchSelectEl.value,
      skip: commits.length,
      onlyMine: onlyMineToggleEl.checked,
      search: searchInputEl.value,
    });
  });

  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg.type === 'commits') {
      commits = msg.commits;
      hasMore = msg.hasMore;
      loadMoreBtn.disabled = false;
      loadMoreBtn.hidden = !hasMore;
      render();
    } else if (msg.type === 'moreCommits') {
      commits = commits.concat(msg.commits);
      hasMore = msg.hasMore;
      loadMoreBtn.disabled = false;
      loadMoreBtn.hidden = !hasMore;
      render();
    } else if (msg.type === 'commitFiles') {
      fileCache.set(msg.hash, msg.files);
      if (openHashes.has(msg.hash)) render();
    }
  });
</script>
</body>
</html>`;
}

async function openCommitHistory(changesProvider) {
  const root = changesProvider.root;
  if (!root) {
    vscode.window.showWarningMessage('Open a folder to view commit history.');
    return;
  }

  let branchInfo;
  let identity;
  let initialCommits;
  let initialHasMore;
  try {
    branchInfo = await getBranches(root);
    identity = await getMyIdentity(root);
    ({ commits: initialCommits, hasMore: initialHasMore } = await getCommitLog(root, branchInfo.current, { onlyMine: true, identity }));
  } catch (err) {
    vscode.window.showErrorMessage(`Git error: ${err.message}`);
    return;
  }

  const panel = vscode.window.createWebviewPanel(
    'gitProfilesHistory',
    'Commit History',
    vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true }
  );
  panel.webview.html = getHistoryHtml(branchInfo.branches, branchInfo.current, initialCommits, initialHasMore);

  panel.webview.onDidReceiveMessage(async (message) => {
    if (message.type === 'branchChanged') {
      try {
        const { commits, hasMore } = await getCommitLog(root, message.branch, {
          onlyMine: message.onlyMine,
          identity,
          search: message.search,
        });
        panel.webview.postMessage({ type: 'commits', commits, hasMore });
      } catch (err) {
        vscode.window.showErrorMessage(`Git error: ${err.message}`);
      }
      return;
    }

    if (message.type === 'loadMore') {
      try {
        const { commits, hasMore } = await getCommitLog(root, message.branch, {
          skip: message.skip,
          onlyMine: message.onlyMine,
          identity,
          search: message.search,
        });
        panel.webview.postMessage({ type: 'moreCommits', commits, hasMore });
      } catch (err) {
        vscode.window.showErrorMessage(`Git error: ${err.message}`);
      }
      return;
    }

    if (message.type === 'getCommitFiles') {
      try {
        const files = await getCommitFiles(root, message.hash);
        panel.webview.postMessage({ type: 'commitFiles', hash: message.hash, files });
      } catch (err) {
        vscode.window.showErrorMessage(`Git error: ${err.message}`);
      }
      return;
    }

    if (message.type === 'openFileDiff') {
      const { hash, filePath } = message;
      const leftUri = gitShowUri(`${hash}^`, filePath);
      const rightUri = gitShowUri(hash, filePath);
      const title = `${path.basename(filePath)} (${hash.slice(0, 7)})`;
      await vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, title);
      return;
    }

    if (message.type === 'revertCommit') {
      const { hash, subject } = message;
      const confirm = await vscode.window.showWarningMessage(
        `Revert commit "${subject}" (${hash.slice(0, 7)})? This creates a new commit that undoes its changes.`,
        { modal: true },
        'Revert'
      );
      if (confirm !== 'Revert') return;
      try {
        await execGit(root, ['revert', '--no-edit', hash], `Revert commit ${hash.slice(0, 7)}: "${subject}"`);
        vscode.window.showInformationMessage(`Reverted commit ${hash.slice(0, 7)}.`);
      } catch (err) {
        vscode.window.showErrorMessage(
          `Revert failed, likely due to a conflict: ${err.message} Resolve it in the Changes view and commit, or run "git revert --abort" in a terminal to cancel.`
        );
      }
      await changesProvider.refresh();
      return;
    }

    if (message.type === 'revertFile') {
      const { hash, filePath } = message;
      const confirm = await vscode.window.showWarningMessage(
        `Revert "${filePath}" to how it was in commit ${hash.slice(0, 7)}? Uncommitted changes to this file will be overwritten.`,
        { modal: true },
        'Revert'
      );
      if (confirm !== 'Revert') return;
      try {
        await execGit(root, ['checkout', hash, '--', filePath], `Revert "${filePath}" to commit ${hash.slice(0, 7)}`);
        vscode.window.showInformationMessage(
          `"${filePath}" reverted to ${hash.slice(0, 7)}. Review it in Changes, then stage and commit.`
        );
      } catch (err) {
        vscode.window.showErrorMessage(`Git error: ${err.message}`);
      }
      await changesProvider.refresh();
    }
  });
}

module.exports = { openCommitHistory };

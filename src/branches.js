const vscode = require('vscode');
const os = require('os');
const { CONFIG_SECTION } = require('./config');
const { execGit, execGitCapture, execGitNoConfirm } = require('./gitExec');

async function getBranches(root) {
  const stdout = await execGit(root, ['branch', '--format=%(refname:short)']);
  const branches = stdout.split('\n').map((s) => s.trim()).filter(Boolean);
  const current = (await execGit(root, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim();
  if (!branches.includes(current)) branches.unshift(current); // detached HEAD, etc.
  return { branches, current };
}

// Pulls the latest changes for whatever branch is currently checked out. If
// the branch has no upstream configured yet (plain "git pull" fails on
// that), falls back to pulling explicitly from "origin <branch>". The
// result -- git's own summary (branch update info, "Already up to date.",
// the diffstat, or the error) -- is shown inside the Git Actions sidebar
// section itself via `actionsProvider`, not a popup or a separate terminal.
async function pullChanges(changesProvider, actionsProvider) {
  const root = changesProvider.root;
  if (!root) {
    vscode.window.showWarningMessage('Open a folder to pull.');
    return;
  }

  let current;
  try {
    current = (await getBranches(root)).current;
  } catch (err) {
    vscode.window.showErrorMessage(`Git error: ${err.message}`);
    return;
  }

  try {
    let result;
    try {
      result = await execGitCapture(root, ['pull'], `Pull the latest changes for "${current}"`);
    } catch (err) {
      if (!/no tracking information|no upstream branch/i.test(err.message)) throw err;
      result = await execGitCapture(root, ['pull', 'origin', current], `Pull the latest changes for "${current}" from origin`);
    }
    const output = [result.stdout, result.stderr].filter((s) => s && s.trim()).join('\n').trim();
    const lines = (output || 'Already up to date.').split('\n').filter(Boolean);
    actionsProvider.setPullResult({ branch: current, ok: true, lines });
  } catch (err) {
    actionsProvider.setPullResult({ branch: current, ok: false, lines: err.message.split('\n').filter(Boolean) });
  } finally {
    await changesProvider.refresh();
  }
}

// -------------------- branch-switch stashing --------------------
// Auto-stashes tagged with the branch they came from, so switching away
// with uncommitted changes doesn't force a manual stash/pop. Switching back
// to that branch later never restores them silently -- it always asks
// permission first, and lets you pick which stash (if there's more than
// one) rather than blindly grabbing whichever matches.

const AUTO_STASH_PREFIX = 'gitProfiles-auto:';

function autoStashMessage(branch) {
  return `${AUTO_STASH_PREFIX}${branch}`;
}

// Pulls the human-readable part back out of a stash subject, stripping the
// "gitProfiles-auto:<branch>" marker (and whatever git itself prefixes it
// with, e.g. "On <branch>: ").
function describeStash(subject, branch) {
  const marker = autoStashMessage(branch);
  const idx = subject.indexOf(marker);
  if (idx === -1) return subject;
  const rest = subject.slice(idx + marker.length).replace(/^:\s*/, '').trim();
  return rest || '(no message)';
}

async function findAutoStashesFor(root, branch) {
  let stdout;
  try {
    stdout = await execGit(root, ['stash', 'list', '--format=%gd%x1f%s%x1f%cr']);
  } catch {
    return [];
  }
  const marker = autoStashMessage(branch);
  const matches = [];
  for (const line of stdout.split('\n').filter(Boolean)) {
    const [ref, subject, when] = line.split('\x1f');
    if (subject && subject.includes(marker)) matches.push({ ref, subject, when });
  }
  return matches;
}

// Checks out `toBranch`. If uncommitted changes on `fromBranch` would be
// clobbered, asks how to handle them (unless `silent` is set -- see below):
//   - "Stash Them": the original flow, unchanged -- type an optional message,
//     changes get stashed (tagged with `fromBranch`) and restored later only
//     with permission, via the auto-stash-restore check below.
//   - "Keep Them Same Across Branch": the changes ride along with the switch
//     instead of being tucked away. Under the hood this still needs a stash
//     (git has no other way to unblock the checkout), but it's a throwaway
//     one -- pushed right before the checkout and popped right after, so the
//     working tree ends up with the same uncommitted changes on `toBranch`
//     that it had on `fromBranch`, without ever being committed or reverted.
//     If the file's content differs enough between the two branches that the
//     change can't reapply cleanly, git reports a normal merge conflict in
//     that file -- inherent to the two versions clashing, not something this
//     can avoid. The stash is deliberately not dropped when that happens, so
//     nothing is lost; the toast tells you what to do next.
// After a successful checkout, if there's a stash tagged for `toBranch` from
// an earlier switch-away, asks whether to restore it -- and which one, if
// there's more than one -- rather than doing it silently.
//
// `options.silent`: skips every popup this function would otherwise show --
// no Training Wheels Yes/No, no "Stash Them" vs "Keep Them Same" choice, and
// no restore-a-tagged-stash prompt. Uncommitted changes are always carried
// straight across to `toBranch` automatically (the "Keep Them Same Across
// Branch" behavior, just without asking first). Used by the sidebar's
// "Switch Branch" command so it never blocks on a dialog.
//
// Returns true if the checkout happened, false if the user declined.
async function checkoutBranchSafely(root, fromBranch, toBranch, explanation, options = {}) {
  const { silent = false } = options;
  const runGit = silent ? execGitNoConfirm : execGit;

  try {
    await runGit(root, ['checkout', toBranch], explanation);
  } catch (err) {
    if (!/would be overwritten by checkout/i.test(err.message)) throw err;

    let choice;
    if (silent) {
      // No dialog -- always carry uncommitted changes across automatically.
      choice = 'Keep Them Same Across Branch';
    } else {
      choice = await vscode.window.showWarningMessage(
        `Your current branch ("${fromBranch}") has uncommitted changes that would be overwritten by switching to "${toBranch}". Stash them (tucked away, restore later with permission), or keep them exactly as they are on "${toBranch}" too?`,
        { modal: true },
        'Stash Them',
        'Keep Them Same Across Branch'
      );
      if (choice !== 'Stash Them' && choice !== 'Keep Them Same Across Branch') return false;
    }

    if (choice === 'Stash Them') {
      const userMessage = await vscode.window.showInputBox({
        prompt: `Message for this stash (optional) -- describes the changes on "${fromBranch}"`,
        placeHolder: 'e.g. WIP on the login form',
        ignoreFocusOut: true,
      });
      const stashMessage =
        userMessage && userMessage.trim() ? `${autoStashMessage(fromBranch)}: ${userMessage.trim()}` : autoStashMessage(fromBranch);

      await runGit(root, ['stash', 'push', '-u', '-m', stashMessage], `Stash uncommitted changes on "${fromBranch}" before switching`);
      await runGit(root, ['checkout', toBranch], explanation);
    } else {
      const carryMessage = `git-profiles-carry-across-switch: ${fromBranch} -> ${toBranch}`;
      await runGit(
        root,
        ['stash', 'push', '-u', '-m', carryMessage],
        `Temporarily set aside uncommitted changes so switching to "${toBranch}" doesn't block on them`
      );

      try {
        await runGit(root, ['checkout', toBranch], explanation);
      } catch (checkoutErr) {
        try {
          await runGit(root, ['stash', 'pop', 'stash@{0}']);
        } catch {
          // leave it stashed rather than risk losing it; the user can restore it manually
        }
        throw checkoutErr;
      }

      try {
        await runGit(root, ['stash', 'pop', 'stash@{0}'], `Reapply your uncommitted changes on "${toBranch}"`);
      } catch (popErr) {
        vscode.window.showWarningMessage(
          `Switched to "${toBranch}", but reapplying your changes conflicted with this branch's version: ${popErr.message} ` +
            `Resolve the conflict markers, then run "git stash drop" to clean up -- the change was applied, not lost.`
        );
      }
    }
  }

  if (silent) return true;

  const stashes = await findAutoStashesFor(root, toBranch);
  if (stashes.length > 0) {
    const items = [
      ...stashes.map((s) => ({
        label: `$(archive) ${describeStash(s.subject, toBranch)}`,
        description: s.when,
        stash: s,
      })),
      { label: "$(circle-slash) Don't restore anything", stash: null },
    ];
    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: `Restore uncommitted changes stashed earlier on "${toBranch}"?`,
    });
    if (picked && picked.stash) {
      try {
        await execGit(root, ['stash', 'pop', picked.stash.ref], `Restore stashed changes on "${toBranch}"`);
        vscode.window.showInformationMessage(`Restored your stashed changes on "${toBranch}".`);
      } catch (err) {
        vscode.window.showWarningMessage(
          `Restoring the stash failed (likely a conflict) -- resolve it manually via "git stash pop". ${err.message}`
        );
      }
    }
  }

  return true;
}

// Branch switcher: a QuickPick acts as the "dropdown" here since VS Code
// tree/sidebar UI can't host a real <select> -- pick a branch from the list
// and it's checked out immediately. The checkout itself, and carrying over
// any uncommitted changes, happens with no confirmation popups (see the
// `silent` option on checkoutBranchSafely) -- only the initial branch-name
// QuickPick is shown.
async function switchBranch(changesProvider) {
  const root = changesProvider.root;
  if (!root) {
    vscode.window.showWarningMessage('Open a folder to switch branches.');
    return;
  }

  let branchInfo;
  try {
    branchInfo = await getBranches(root);
  } catch (err) {
    vscode.window.showErrorMessage(`Git error: ${err.message}`);
    return;
  }

  const picked = await vscode.window.showQuickPick(
    branchInfo.branches.map((b) => branchQuickPickItem(b, branchInfo.current)),
    { placeHolder: `Current branch: ${branchInfo.current} — select a branch to switch to` }
  );
  if (!picked || picked.branch === branchInfo.current) return;

  let switched;
  try {
    switched = await checkoutBranchSafely(
      root,
      branchInfo.current,
      picked.branch,
      `Switch to branch "${picked.branch}"`,
      { silent: true }
    );
  } catch (err) {
    vscode.window.showErrorMessage(`Git error: ${err.message}`);
    return;
  }
  if (switched) {
    vscode.window.showInformationMessage(`Switched to branch "${picked.branch}".`);
  }
  await changesProvider.refresh();
}

// -------------------- protected branches & merging --------------------
// There's no local git command that can tell us whether a branch is
// protected on GitHub/GitLab/etc -- that's a server-side setting, only
// visible through each platform's own API (which needs a token and knowing
// which platform it is). So this list is user-maintained instead: branches
// named here never get a direct local merge from this extension, no matter
// which host the remote points to. A trailing "*" matches as a prefix
// (e.g. "release/*").

function isProtectedBranch(branch) {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const list = config.get('protectedBranches') || [];
  return list.some((pattern) => (pattern.endsWith('*') ? branch.startsWith(pattern.slice(0, -1)) : branch === pattern));
}

// Shared QuickPick item shape for branch pickers: flags the current branch
// and clearly marks protected ones with a lock icon, not just buried in the
// description text.
function branchQuickPickItem(branch, currentBranch) {
  const protectedBranch = isProtectedBranch(branch);
  const icon = branch === currentBranch ? '$(check)' : '$(git-branch)';
  const tags = [];
  if (branch === currentBranch) tags.push('current');
  if (protectedBranch) tags.push('protected — merges go through a pull request');
  return {
    label: `${icon} ${branch}${protectedBranch ? ' $(lock)' : ''}`,
    description: tags.join(', '),
    branch,
  };
}

async function getRemoteUrl(root) {
  try {
    return (await execGit(root, ['remote', 'get-url', 'origin'])).trim();
  } catch {
    return null;
  }
}

// Parses an https:// or git@host: remote URL into { host, owner, repo }.
function parseRemoteUrl(remoteUrl) {
  if (!remoteUrl) return null;

  const sshMatch = remoteUrl.match(/^git@([^:]+):(.+?)(\.git)?$/);
  if (sshMatch) {
    const [, host, ownerRepo] = sshMatch;
    const parts = ownerRepo.split('/');
    const repo = parts.pop();
    return { host, owner: parts.join('/'), repo };
  }

  try {
    const u = new URL(remoteUrl);
    const segments = u.pathname.replace(/^\//, '').replace(/\.git$/, '').split('/');
    const repo = segments.pop();
    return { host: u.hostname, owner: segments.join('/'), repo };
  } catch {
    return null;
  }
}

// Builds a "create pull/merge request" URL pre-filled with source -> target,
// recognizing the common hosts. Falls back to the bare repo URL otherwise.
function buildPullRequestUrl({ host, owner, repo }, source, target) {
  const s = encodeURIComponent(source);
  const t = encodeURIComponent(target);

  if (host.includes('github.com')) {
    return `https://${host}/${owner}/${repo}/compare/${t}...${s}?expand=1`;
  }
  if (host.includes('gitlab')) {
    return `https://${host}/${owner}/${repo}/-/merge_requests/new?merge_request%5Bsource_branch%5D=${s}&merge_request%5Btarget_branch%5D=${t}`;
  }
  if (host.includes('bitbucket.org')) {
    return `https://${host}/${owner}/${repo}/pull-requests/new?source=${s}&dest=${encodeURIComponent(`${owner}/${repo}`)}%3A%3A${t}`;
  }
  if (host.includes('dev.azure.com') || host.includes('visualstudio.com')) {
    return `https://${host}/${owner}/_git/${repo}/pullrequestcreate?sourceRef=${s}&targetRef=${t}`;
  }
  return `https://${host}/${owner}/${repo}`;
}

// Merges `source` into every branch in `targetNames`. Protected targets
// never get a direct local merge -- instead `source` is pushed and a
// pull/merge request page is opened for a human to review and approve on
// the actual hosting platform. Returns to `startBranch` afterward unless a
// conflict left the repo mid-merge on one of the targets. Used by the
// commit panel's "merge after push" option.
async function performMerge(root, source, targetNames, startBranch) {
  let currentActualBranch = startBranch;
  let stoppedDueToConflict = false;
  const merged = [];
  const prOpened = [];
  const failed = [];

  for (const target of targetNames) {
    if (isProtectedBranch(target)) {
      try {
        await execGit(root, ['push', '-u', 'origin', source], `Push "${source}" so a pull request can target "${target}"`);
        const parsed = parseRemoteUrl(await getRemoteUrl(root));
        if (parsed) {
          await vscode.env.openExternal(vscode.Uri.parse(buildPullRequestUrl(parsed, source, target)));
          prOpened.push(target);
        } else {
          failed.push({ target, reason: "pushed, but couldn't determine the remote host to build a PR link" });
        }
      } catch (err) {
        failed.push({ target, reason: err.message });
      }
      continue;
    }

    try {
      const switched = await checkoutBranchSafely(
        root,
        currentActualBranch,
        target,
        `Switch to "${target}" to merge "${source}" into it`
      );
      if (!switched) {
        failed.push({ target, reason: 'switch declined (uncommitted changes)' });
        continue;
      }
      currentActualBranch = target;

      await execGit(root, ['merge', '--no-edit', source], `Merge "${source}" into "${target}"`);
      merged.push(target);
    } catch (err) {
      failed.push({ target, reason: err.message });
      stoppedDueToConflict = true;
      break; // repo is likely mid-conflict on `target` -- don't touch it further
    }
  }

  if (!stoppedDueToConflict && currentActualBranch !== startBranch) {
    try {
      await execGit(root, ['checkout', startBranch], `Switch back to "${startBranch}"`);
    } catch {
      // leave it as-is; the caller's summary still says where things ended up
    }
  }

  return { merged, prOpened, failed };
}

module.exports = {
  getBranches,
  pullChanges,
  checkoutBranchSafely,
  switchBranch,
  isProtectedBranch,
  branchQuickPickItem,
  getRemoteUrl,
  parseRemoteUrl,
  buildPullRequestUrl,
  performMerge,
};

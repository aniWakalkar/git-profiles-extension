const vscode = require('vscode');
const { getProfiles, saveProfiles } = require('./config');

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
  .command-input-wrap {
    position: relative;
    flex: 1;
  }
  .command-row input {
    width: 100%;
    box-sizing: border-box;
  }
  .suggest-panel {
    position: absolute;
    top: calc(100% + 2px);
    left: 0;
    right: 0;
    max-height: 260px;
    overflow-y: auto;
    background: var(--vscode-dropdown-background, var(--vscode-editor-background));
    border: 1px solid var(--vscode-dropdown-border, var(--vscode-input-border, #444));
    border-radius: 3px;
    z-index: 50;
    box-shadow: 0 4px 10px rgba(0,0,0,0.35);
    display: none;
  }
  .suggest-panel.open {
    display: block;
  }
  .suggest-item {
    padding: 6px 10px;
    cursor: pointer;
    border-bottom: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.15));
  }
  .suggest-item:last-child {
    border-bottom: none;
  }
  .suggest-item:hover,
  .suggest-item.active {
    background: var(--vscode-list-hoverBackground, rgba(128,128,128,0.2));
  }
  .suggest-cmd {
    font-family: var(--vscode-editor-font-family);
    font-weight: 600;
    font-size: 13px;
  }
  .suggest-desc {
    font-size: 11.5px;
    opacity: 0.75;
    margin-top: 2px;
  }
  .suggest-empty {
    padding: 8px 10px;
    opacity: 0.6;
    font-size: 12px;
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

  // Common git commands with short Hinglish descriptions, shown in the
  // suggestion dropdown under each command input.
  const GIT_COMMANDS = [
    { cmd: 'git init', desc: 'Naya Git repository initialize karta hai' },
    { cmd: 'git clone <url>', desc: 'Remote repository ko local mein copy karta hai' },
    { cmd: 'git status', desc: 'Working directory aur staging area ka status dikhata hai' },
    { cmd: 'git add .', desc: 'Saari changed/new files ko staging area mein add karta hai' },
    { cmd: 'git add <file>', desc: 'Sirf specific file ko staging area mein add karta hai' },
    { cmd: 'git commit -m "message"', desc: 'Staged changes ko ek commit ke roop mein save karta hai' },
    { cmd: 'git commit -am "message"', desc: 'Tracked files ko add + commit ek saath karta hai' },
    { cmd: 'git push', desc: 'Local commits ko remote repository pe bhejta hai' },
    { cmd: 'git push origin <branch>', desc: 'Specific branch ko remote pe push karta hai' },
    { cmd: 'git push -u origin <branch>', desc: 'Push karke branch ka default upstream set karta hai' },
    { cmd: 'git push --force', desc: 'Remote history overwrite karke force push karta hai (risky)' },
    { cmd: 'git pull', desc: 'Remote se latest changes fetch karke current branch mein merge karta hai' },
    { cmd: 'git fetch', desc: 'Remote se changes download karta hai, bina merge kiye' },
    { cmd: 'git branch', desc: 'Saari local branches ki list dikhata hai' },
    { cmd: 'git branch <name>', desc: 'Nayi branch banata hai (switch nahi karta)' },
    { cmd: 'git branch -d <name>', desc: 'Ek local branch ko delete karta hai' },
    { cmd: 'git checkout <branch>', desc: 'Kisi existing branch pe switch karta hai' },
    { cmd: 'git checkout -b <branch>', desc: 'Nayi branch banake usme switch karta hai' },
    { cmd: 'git switch <branch>', desc: 'Branch switch karne ka newer, simpler command' },
    { cmd: 'git merge <branch>', desc: 'Specified branch ko current branch mein merge karta hai' },
    { cmd: 'git rebase <branch>', desc: 'Current branch ke commits ko doosri branch ke upar reapply karta hai' },
    { cmd: 'git log', desc: 'Commit history detail mein dikhata hai' },
    { cmd: 'git log --oneline', desc: 'Compact, ek-line-per-commit history dikhata hai' },
    { cmd: 'git diff', desc: 'Unstaged changes dikhata hai (last commit se difference)' },
    { cmd: 'git diff --staged', desc: 'Staged (add kiye hue) changes dikhata hai' },
    { cmd: 'git stash', desc: 'Uncommitted changes ko temporarily side mein rakh deta hai' },
    { cmd: 'git stash pop', desc: 'Stash kiye hue changes wapas la deta hai' },
    { cmd: 'git reset <file>', desc: 'File ko staging area se hata deta hai (changes safe rehte hain)' },
    { cmd: 'git reset --hard', desc: 'Saari uncommitted changes discard kar deta hai (DANGEROUS)' },
    { cmd: 'git revert <commit>', desc: 'Kisi commit ko undo karne ke liye naya commit banata hai' },
    { cmd: 'git remote add origin <url>', desc: 'Remote repository ko project se link karta hai' },
    { cmd: 'git remote -v', desc: 'Configured remotes (origin, etc.) dikhata hai' },
    { cmd: 'git tag <name>', desc: 'Current commit pe ek tag/label lagata hai' },
    { cmd: 'git clean -fd', desc: 'Untracked files/folders permanently delete karta hai (DANGEROUS)' },
    { cmd: 'git config --global user.name "Your Name"', desc: 'Global commit author name set karta hai' },
    { cmd: 'git config --global user.email "you@example.com"', desc: 'Global commit author email set karta hai' },
  ];

  function filterCommands(query) {
    const q = query.trim().toLowerCase();
    if (!q) return GIT_COMMANDS;
    return GIT_COMMANDS.filter(
      (g) => g.cmd.toLowerCase().includes(q) || g.desc.toLowerCase().includes(q)
    );
  }

  function closeAllPanels() {
    document.querySelectorAll('.suggest-panel').forEach((p) => p.classList.remove('open'));
  }

  function render() {
    listEl.innerHTML = '';
    commands.forEach((cmd, i) => {
      const row = document.createElement('div');
      row.className = 'command-row';

      const wrap = document.createElement('div');
      wrap.className = 'command-input-wrap';

      const input = document.createElement('input');
      input.type = 'text';
      input.value = cmd;
      input.placeholder = 'Type, or click to pick from Git command list';
      input.autocomplete = 'off';

      const panel = document.createElement('div');
      panel.className = 'suggest-panel';

      function renderPanel(query) {
        const matches = filterCommands(query);
        panel.innerHTML = '';
        if (matches.length === 0) {
          const empty = document.createElement('div');
          empty.className = 'suggest-empty';
          empty.textContent = 'No matching command \u2014 keep your custom text';
          panel.appendChild(empty);
          return;
        }
        matches.forEach((g) => {
          const item = document.createElement('div');
          item.className = 'suggest-item';
          const cmdEl = document.createElement('div');
          cmdEl.className = 'suggest-cmd';
          cmdEl.textContent = g.cmd;
          const descEl = document.createElement('div');
          descEl.className = 'suggest-desc';
          descEl.textContent = g.desc;
          item.appendChild(cmdEl);
          item.appendChild(descEl);
          item.addEventListener('mousedown', (e) => {
            // mousedown (not click) so it fires before the input's blur
            e.preventDefault();
            input.value = g.cmd;
            commands[i] = g.cmd;
            panel.classList.remove('open');
          });
          panel.appendChild(item);
        });
      }

      input.addEventListener('input', (e) => {
        commands[i] = e.target.value;
        renderPanel(e.target.value);
        panel.classList.add('open');
      });
      input.addEventListener('focus', () => {
        closeAllPanels();
        renderPanel(input.value);
        panel.classList.add('open');
      });
      input.addEventListener('blur', () => {
        // small delay so a mousedown-selection above still registers first
        setTimeout(() => panel.classList.remove('open'), 100);
      });

      const removeBtn = document.createElement('button');
      removeBtn.className = 'icon-btn';
      removeBtn.title = 'Remove command';
      removeBtn.textContent = '✕';
      removeBtn.addEventListener('click', () => {
        commands.splice(i, 1);
        if (commands.length === 0) commands.push('');
        render();
      });

      wrap.appendChild(input);
      wrap.appendChild(panel);
      row.appendChild(wrap);
      row.appendChild(removeBtn);
      listEl.appendChild(row);
    });
  }

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.command-input-wrap')) closeAllPanels();
  });

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

module.exports = { openProfileForm };

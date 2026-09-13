const { execGit } = require('./gitExec');

// Parses `git status --porcelain=v1 -z` into staged / unstaged file lists.
// -z avoids path quoting so filenames with spaces/unicode parse cleanly.
async function getGitChanges(cwd) {
  let stdout;
  try {
    stdout = await execGit(cwd, ['status', '--porcelain=v1', '-z']);
  } catch (err) {
    return { error: err.message, staged: [], unstaged: [] };
  }

  const tokens = stdout.split('\0').filter(Boolean);
  const staged = [];
  const unstaged = [];

  for (let i = 0; i < tokens.length; i++) {
    const entry = tokens[i];
    const x = entry[0];
    const y = entry[1];
    const filePath = entry.slice(3);

    if (x === '?' && y === '?') {
      unstaged.push({ filePath, code: 'U' });
      continue;
    }
    if (x === '!' && y === '!') continue; // ignored, only shown with --ignored

    if (x !== ' ') staged.push({ filePath, code: x });
    if (y !== ' ') unstaged.push({ filePath, code: y });
    // Renamed/copied entries carry an extra NUL-separated "original path"
    // token right after them that we don't need for display.
    if (x === 'R' || x === 'C') i++;
  }

  return { error: null, staged, unstaged };
}

async function stageFile(root, filePath) {
  await execGit(root, ['add', '--', filePath], `Stage "${filePath}" for the next commit`);
}

async function unstageFile(root, filePath) {
  await execGit(root, ['reset', '--', filePath], `Unstage "${filePath}"`);
}

async function stageFiles(root, filePaths) {
  if (filePaths.length === 0) return;
  await execGit(root, ['add', '--', ...filePaths], `Stage ${filePaths.length} file(s) for the next commit`);
}

async function unstageFiles(root, filePaths) {
  if (filePaths.length === 0) return;
  await execGit(root, ['reset', '--', ...filePaths], `Unstage ${filePaths.length} file(s)`);
}

async function stageAllChanges(root) {
  await execGit(root, ['add', '-A'], 'Stage every changed file');
}

async function unstageAllChanges(root) {
  await execGit(root, ['reset'], 'Unstage every staged file');
}

module.exports = {
  getGitChanges,
  stageFile,
  unstageFile,
  stageFiles,
  unstageFiles,
  stageAllChanges,
  unstageAllChanges,
};

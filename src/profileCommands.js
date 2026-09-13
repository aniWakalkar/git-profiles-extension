const vscode = require('vscode');
const { getProfiles, saveProfiles } = require('./config');
const { openProfileForm } = require('./profileForm');
const { runCommandsInTerminal } = require('./terminal');

async function createProfile() {
  openProfileForm(null);
}

async function editProfile() {
  const profiles = getProfiles();
  const names = Object.keys(profiles);
  if (names.length === 0) {
    vscode.window.showInformationMessage('No profiles to edit yet. Create one first.');
    return;
  }
  const picked = await vscode.window.showQuickPick(names, { placeHolder: 'Select a profile to edit' });
  if (!picked) return;
  openProfileForm(picked);
}

async function deleteProfile() {
  const profiles = getProfiles();
  const names = Object.keys(profiles);
  if (names.length === 0) {
    vscode.window.showInformationMessage('No profiles to delete.');
    return;
  }
  const picked = await vscode.window.showQuickPick(names, { placeHolder: 'Select a profile to delete' });
  if (!picked) return;
  await deleteProfileByName(picked);
}

async function deleteProfileByName(name) {
  const confirm = await vscode.window.showWarningMessage(`Delete profile "${name}"?`, { modal: true }, 'Delete');
  if (confirm !== 'Delete') return;
  const profiles = getProfiles();
  delete profiles[name];
  await saveProfiles(profiles);
  vscode.window.showInformationMessage(`Profile "${name}" deleted.`);
}

async function openSettings() {
  await vscode.commands.executeCommand('workbench.action.openSettingsJson', {
    revealSetting: { key: 'gitProfiles.profiles' },
  });
}

async function runProfileViaPalette() {
  const profiles = getProfiles();
  const names = Object.keys(profiles);
  if (names.length === 0) {
    const choice = await vscode.window.showInformationMessage(
      'No Git profiles configured yet. Create one now?',
      'Create Profile'
    );
    if (choice === 'Create Profile') await createProfile();
    return;
  }
  const picked = await vscode.window.showQuickPick(
    names.map((name) => ({ label: name, description: (profiles[name] || []).join('  ->  ') })),
    { placeHolder: 'Select a Git profile to run' }
  );
  if (!picked) return;
  runCommandsInTerminal(profiles[picked.label], picked.label);
}

module.exports = {
  createProfile,
  editProfile,
  deleteProfile,
  deleteProfileByName,
  openSettings,
  runProfileViaPalette,
};

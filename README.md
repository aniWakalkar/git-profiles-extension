# Git Profiles — VS Code Extension

Ek sidebar se apne **Git command profiles** run karo, **file changes** stage/commit/push karo,
**branches switch/merge karo**, aur **commit history** browse karo — sab ek hi activity bar
container ke andar, teen alag sections mein.

## Table of Contents

- [Sidebar Overview](#sidebar-overview)
- [1. "Git Profiles" section](#1-git-profiles-section)
- [2. "Changes" section](#2-changes-section)
  - [Commit panel (webview)](#commit-panel-webview)
- [3. "Git Actions" section](#3-git-actions-section)
  - [Switch Branch + auto-stash flow](#switch-branch--auto-stash-flow)
  - [Merge Branches... + protected branches](#merge-branches--protected-branches)
  - [Commit History panel](#commit-history-panel)
- [Cross-cutting features](#cross-cutting-features)
  - [Training Wheels](#training-wheels)
  - [Command Log](#command-log)
  - [Authentication](#authentication)
- [Settings reference](#settings-reference)
- [Command Palette reference](#command-palette-reference)
- [Project structure](#project-structure)
- [Install / Try karne ka tarika](#install--try-karne-ka-tarika-local-use-ke-liye)
- [Marketplace pe publish karna](#marketplace-pe-publish-karna-taaki-koi-bhi-search-karke-install-kar-sake)
- [Notes](#notes)

---

## Sidebar Overview

Left activity bar mein ek **Git Profiles** icon (🔀-jaisa `</>`+commit-node icon) dikhega. Click
karne par teen collapsible sections khulte hain:

```
GIT PROFILES (activity bar container)
 ├─ ▾ Git Profiles     -> apne custom command "profiles" (Normal, Migration, etc.)
 ├─ ▾ Changes          -> stage / unstage / discard / diff / commit
 └─ ▾ Git Actions      -> switch branch, pull, merge, commit history, command log
```

Har section ka apna **title-bar toolbar** hai (icons upar-right corner mein) jinka detail neeche
hai.

---

## 1. "Git Profiles" section

Ye original feature hai: apne repeat hone wale Git command sequences ko naam de kar save karo,
aur ek click/checkbox se run karo.

```
GIT PROFILES                    [+] [🔑] [🎓] [⟳]
 ├─ ▸ Normal            [▶] [+] [✎] [🗑]
 │     ☑ git add .
 │     ☑ git commit -m "update"
 │     ☑ git push
 ├─ ▸ Migration          [▶] [+] [✎] [🗑]
 │     ☑ git add .
 │     ☐ git commit -m "migration"
 │     ☑ git push origin migration
```

### Section toolbar (upar)

| Icon | Command | Kaam |
|---|---|---|
| `+` | `gitProfiles.createProfile` | Naya profile banane ke liye [full form panel](#full-form-panelname--commands-ek-page-pe) kholta hai |
| 🔑 | `gitProfiles.setAuthentication` | [Authentication](#authentication) set karo (naam, email, host, token) |
| 🎓 | `gitProfiles.toggleTrainingWheels` | [Training Wheels](#training-wheels) on/off |
| 📄 | `gitProfiles.openCommandLog` | [Command Log](#command-log) file kholo |
| ⟳ | `gitProfiles.refreshView` | Tree ko manually refresh karo |

### Har profile row

- **Profile naam par click** → sirf row **expand/collapse** hoti hai, **koi command run nahi
  hoti** (safety ke liye — accidental run rokne ko).
- **▶ (Run Checked)** → sirf jo commands **checked (☑)** hain, wahi terminal mein sequence se run
  honge (unchecked commands skip ho jayenge).
- **+ (Add Command)** → **same [full form panel](#full-form-panelname--commands-ek-page-pe)**
  khulta hai jisme profile ka naam + saare commands already fill hote hain (chhota single-line
  input box nahi hai — poora rich editor hai, autocomplete ke saath).
- **✎ (Rename)** → profile ka sirf naam change karo (quick inline input).
- **🗑 (Delete)** → profile hata do (confirmation modal popup aayega).
- **☑ / ☐ checkbox** har command ke aage → is specific run ke liye include/exclude karo. Ye state
  sirf current VS Code session ke liye hai (default: sab checked), settings.json ki list ko
  change nahi karta.
- Har command line pe hover karo to uske apne **✎ Edit** / **🗑 Delete** icons milenge.
- Right-click profile par → **Select All Commands** / **Deselect All Commands**.

### Full form panel (Name + Commands ek page pe)

`+` icon, profile ka `+` (Add Command), ya Command Palette se `Git Profiles: Create New Profile` /
`Git Profiles: Edit Profile` chalane par ek **pura tab/page** khulta hai:

```
┌─────────────────────────────────────┐
│ Profile Name                         │
│ [ Frontend                        ]  │
│                                       │
│ Commands                             │
│ [ git add src/              ] [✕]    │
│ [ git commit -m "frontend"  ] [✕]    │
│ [ git push origin frontend  ] [✕]    │
│ [+ Add Command]                      │
│                                       │
│ [ Save Profile ]   [ Cancel ]        │
└─────────────────────────────────────┘
```

- Har command apni khud ki row mein hai, apna **✕ remove** button ke saath.
- **+ Add Command** se jitni chaho utni rows add kar sakte ho.
- **Save Profile** dabate hi profile settings mein save ho jata hai aur sidebar turant refresh ho
  jata hai.
- Isi form se profile **rename** bhi ho jata hai — bas Name field change karke Save dabao.

#### Git command suggestions (autocomplete)

Har command input box pe **click ya type karte hi** ek dropdown khulta hai jisme common Git
commands unki Hinglish description ke saath dikhte hain (jaise `git checkout <branch>`,
`git stash`, `git rebase <branch>`, etc.). Type karte hi list filter hoti hai; kisi suggestion pe
click karo to wahi command box mein fill ho jata hai. Ye sirf ek helper hai — apna custom command
bhi directly type karke save kar sakte ho.

### settings.json se direct edit (sabse fast)

```json
"gitProfiles.profiles": {
  "Normal": ["git add .", "git commit -m \"update\"", "git push"],
  "Migration": ["git add .", "git commit -m \"migration\"", "git push origin migration"],
  "Frontend": ["git add src/", "git commit -m \"frontend\"", "git push origin frontend"]
}
```

---

## 2. "Changes" section

VS Code ke built-in Source Control jaisa, lekin apna banaya hua — file-level stage/unstage,
inline diff viewer, discard, aur commit — checkbox-based UI ke saath.

```
CHANGES                         [💾] [↩] [✔] [❌] [⟳]
 ├─ ▾ Staged Changes (2)
 │     ☑ src/App.jsx           M
 │     ☑ src/utils/helpers.js  A
 └─ ▾ Changes (1)
       ☐ src/index.js          M
```

### Section toolbar (upar)

| Icon | Command | Kaam |
|---|---|---|
| 💾 | `gitProfiles.commitChanges` | [Commit panel](#commit-panel-webview) kholo |
| ↩ | `gitProfiles.revertCheckedFiles` | Jo files **checked (staged)** hain, unhe last commit tak **revert** kar do (confirmation ke saath) |
| ✔ | `gitProfiles.stageAllChanges` | Saari changed files ek saath stage karo |
| ❌ | `gitProfiles.unstageAllChanges` | Saari staged files ek saath unstage karo |
| ⟳ | `gitProfiles.refreshChanges` | Manually refresh karo |

### Har file row

- **File ka checkbox** → check karne se file **stage** ho jaati hai, uncheck karne se **unstage**
  — turant UI update hota hai (git command background mein chalti hai, lag feel nahi hoga).
- **File naam par click** → us file ka **diff** khulta hai (staged files ke liye INDEX vs HEAD,
  unstaged ke liye working-tree vs HEAD).
- Hover karne par inline icons milte hain:
  - **↩ (Discard Changes)** — is single file ke uncommitted changes discard karo.
  - **🕐 (Revert to Specific Commit...)** — us file ki poori commit history se koi bhi purana
    version choose karke usi pe file ko revert kar do.
- Tree file system watcher se apne aap refresh hoti rehti hai jab bhi disk par files change hoti
  hain.

### Commit panel (webview)

💾 button ya file par click karke commit karte waqt ek pura panel khulta hai:

```
┌───────────────────────────────────────────┐
│ BRANCH                                     │
│ 🌿 feature/login            (read-only)    │
│                                             │
│ FILES                                      │
│ [x] Select All                             │
│ [x] M  src/App.jsx                         │
│ [ Apply Stage ]                            │
│                                             │
│ COMMIT MESSAGE                             │
│ [ ...                                   ]  │
│                                             │
│ [x] Push after commit                      │
│ [ ] Also merge into other branches...      │
│   -> checked hote hi target branch list    │
│      checkbox ke saath khulti hai          │
│                                             │
│ [ Commit ]   [ Cancel ]                    │
└───────────────────────────────────────────┘
```

- **Branch** — sirf **current branch dikhti hai (read-only)**, koi dropdown/switch nahi — isse
  aap kabhi galti se doosri branch par commit/push nahi kar sakte.
- **Files** — checkbox se stage/unstage select karo, **Apply Stage** se actually apply karo (ya
  seedha Commit dabao — wo bhi apply kar dega).
- **Push after commit** — commit ke turant baad `git push -u origin <branch>` (pehli baar push ho
  rahi ho to upstream bhi automatically set ho jata hai).
- **Also merge into other branches after pushing** — check karte hi:
  - **Push after commit** automatically ON ho kar **lock** ho jata hai (merge ke liye push zaroori
    hai).
  - Neeche ek branch-checkbox list khulti hai — jitni chaho utni target branches select karo.
  - Commit dabate hi: **Commit → Push → har selected target mein Merge** (same logic jo
    [Merge Branches...](#merge-branches--protected-branches) use karta hai — protected branch ho
    to seedha merge na karke **Pull Request** khol dega).

---

## 3. "Git Actions" section

Branch-level aur repo-level actions — switch, pull, merge, history, aur command-log controls.
Ye view sirf toolbar hai, koi tree content nahi.

```
GIT ACTIONS                     [⇄] [⬇] [🔀] [🔗] [✅] [📄]
```

| Icon | Command | Kaam |
|---|---|---|
| ⇄ | `gitProfiles.switchBranch` | [Branch switch karo](#switch-branch--auto-stash-flow) (QuickPick list se) |
| ⬇ | `gitProfiles.pullChanges` | Current branch ke liye `git pull` (asli output dikhega) |
| 🔀 | `gitProfiles.mergeBranches` | [Branches merge karo](#merge-branches--protected-branches) (multi-target) |
| 🔗 | `gitProfiles.showCommitHistory` | [Commit History panel](#commit-history-panel) kholo |
| ✅ | `gitProfiles.toggleCommandLog` | [Command Log](#command-log) on/off |
| 📄 | `gitProfiles.openCommandLog` | Command log file kholo |

Status bar (VS Code window ke bottom-left) mein bhi current branch ka naam dikhta hai
(`$(git-branch) <branch>`) — usi par click karke bhi Switch Branch khul jata hai.

### Switch Branch + auto-stash flow

⇄ ya status-bar branch-name par click karne se ek QuickPick list khulti hai (saari local
branches, current branch par ✓, protected branches par 🔒). Branch select karte hi:

1. `git checkout <target>` try hota hai.
2. **Agar current branch mein uncommitted changes hain** jo target branch se overwrite ho jate:
   - Ek **modal popup**: *"Stash them and switch?"* (Yes/No).
   - **Yes** par → ek **input box** aata hai jisme aap stash ke liye apna **custom message type**
     kar sakte ho (optional). Phir `git stash push -u -m "..."` + checkout.
   - **No** par → kuch nahi hota, switch cancel.
3. **Target branch pe pahunchne ke baad**, agar us branch ke liye pehle se koi stash(es) pada
   milta hai:
   - **Kabhi silently restore nahi hota.** Ek QuickPick list khulti hai jisme har purane stash ka
     **message + relative time** dikhta hai, plus ek **"Don't restore anything"** option.
   - Aap jo stash choose karo, sirf wahi `git stash pop` hoga.

Ye poora flow `switchBranch`, [`mergeBranches`](#merge-branches--protected-branches), aur commit
panel ke "switch before commit" — teeno jagah se use hota hai (shared helper function).

### Merge Branches... + protected branches

🔀 se ek 2-step QuickPick khulta hai:

1. **Merge FROM which branch?** (source — single select)
2. **Merge INTO which branch(es)?** (targets — **multi-select**, checkbox se ek saath kai
   branches choose kar sakte ho, jaise `testing` + `sandbox` dono ek saath)

Har target ke liye:

- **Normal branch** → stash-safe checkout + `git merge --no-edit <source>`. Conflict aaya to
  batch wahin ruk jaati hai (baaki targets touch nahi honge), taaki aap conflict resolve kar sako.
- **Protected branch** (settings ki `gitProfiles.protectedBranches` list mein) → seedha merge
  **nahi** hota. Uske bajaye: source branch push hoti hai aur browser mein **Create Pull/Merge
  Request** page khul jata hai (GitHub / GitLab / Bitbucket / Azure DevOps — remote URL se
  auto-detect hota hai, source→target pehle se fill).

Sab merges ke baad aap wapas apni asli branch par switch ho jate ho, aur ek summary message
dikhta hai (kya merge hua, kaha PR khula, kahan fail hua).

> **Note:** Protection sirf is extension ke andar ek **local safety gate** hai
> (`gitProfiles.protectedBranches` setting) — git ya GitHub/GitLab khud "approval" jaisi cheez
> nahi jaanta, wo sirf platform-side (PR review) par hota hai.

### Commit History panel

🔗 se ek webview panel khulta hai:

```
BRANCH
[ feature/login          ▼ ]

COMMITS
▸ Fix date picker validation bug    abc1234 · 2026-09-05 14:22 · Aniket
    M src/components/DatePicker.jsx    [↺]
    M src/utils/validate.js            [↺]
  [↺ Revert this commit]
▸ Add carrier card UI               ...
[ Load 100 More ]
```

- **Branch dropdown** — koi bhi branch choose karo, uski commit history load ho jaati hai
  (commit message, hash, date, author).
- **Commit expand karo** → us commit mein exactly konsi files badli thi (M/A/D status ke saath),
  **lazily load** hoti hain.
- **File par click** → us commit ka diff (pehle vs baad mein) khulta hai.
- **↺ har file ke saamne** → sirf us file ko us commit ke version par revert karo (baaki files
  untouched).
- **↺ Revert this commit** (commit header par) → `git revert --no-edit <hash>` — poora commit
  undo karne wala ek NAYA commit banata hai (history rewrite nahi karta).
- **Load 100 More** → purani commits pagination se load karo.

---

## Cross-cutting features

### Training Wheels

**Default: ON.** Jab bhi UI se koi meaningful git command chalne wali ho (stage, commit, switch,
merge, revert, etc.), ek confirmation popup dikhta hai:

> *"Git Profiles wants to run:*
> `$ git checkout feature-x`
> *Switch to branch "feature-x"* — **Yes** / **No**

**Yes** karne par hi command chalti hai. On/off `gitProfiles.toggleTrainingWheels` (🎓 icon,
Git Profiles toolbar) se, ya settings.json mein `gitProfiles.trainingWheels`.

Silent/read-only queries (jaise `git status` polling, branch listing) is gate se exempt hain —
warna bahut zyada popups aate.

### Command Log

**Default: OFF** — koi log file automatically nahi banti jab tak explicitly enable na karo (taaki
bewajah files generate na hon).

- **Toggle** (`gitProfiles.toggleCommandLog`, ✅ icon Git Actions mein) — **ON karte waqt ek
  confirmation popup** aata hai ("this will create a log file on disk..."), **OFF** karne mein
  koi confirmation nahi chahiye.
- Jab ON ho, har meaningful command (profile-run ho ya UI-triggered) do jagah log hoti hai:
  1. Ek dedicated **read-only terminal** ("Git Profiles Log") mein real-time echo — har line ke
     saath ek chhota explanation.
  2. Ek **log file** mein (timestamp + command + explanation).
- File ki location: `gitProfiles.logFilePath` setting, ya `Git Profiles: Set Command Log Location`
  command se file-picker se choose karo (empty chhodo to default location extension ke global
  storage ke andar).
- `Git Profiles: Open Command Log File` (📄 icon) — log file ko editor mein kholo.
- `Git Profiles: Show Command Log Terminal` — us terminal ko manually reveal karo.

### Authentication

`gitProfiles.setAuthentication` (🔑 icon, Git Profiles toolbar): naam, email, git host (default
`github.com`), aur password/token (masked input) poochta hai. Save karne par:

- `git config user.name` / `user.email` set ho jate hain.
- Agar koi credential helper (jaise Git Credential Manager) pehle se configured nahi hai, to
  Git ka apna `credential.helper store` enable ho jata hai.
- Email + token us host ke liye Git ke credential system mein cache ho jata hai — future
  push/pull baar-baar nahi poochega.

`gitProfiles.clearAuthentication` se cached login hata sakte ho.

> **Security note:** Email `context.secrets` (OS keychain-backed) mein store hota hai. Agar system
> par Git Credential Manager nahi hai, to Git khud `~/.git-credentials` mein **plaintext** save
> karta hai (ye Git ka apna standard behavior hai) — GCM install karna zyada secure hai.

---

## Settings reference

| Setting | Type | Default | Kaam |
|---|---|---|---|
| `gitProfiles.profiles` | object | `{Normal: [...], Migration: [...]}` | Named command profiles |
| `gitProfiles.runInSameTerminal` | boolean | `true` | Profile run ke liye ek hi terminal reuse karo |
| `gitProfiles.trainingWheels` | boolean | `true` | Har UI-triggered command se pehle confirm popup |
| `gitProfiles.enableCommandLog` | boolean | `false` | Command log (file + terminal) on/off |
| `gitProfiles.logFilePath` | string | `""` (empty = default location) | Log file kahan likhni hai |
| `gitProfiles.protectedBranches` | string[] | `[]` | In branches mein direct merge nahi, PR khulega (`release/*` jaisa prefix bhi chalega) |

---

## Command Palette reference

`Ctrl+Shift+P` se ye sab commands available hain:

| Command | Kaam |
|---|---|
| `Git Profiles: Run Profile` | List se profile select karo → checked commands run |
| `Git Profiles: Create New Profile` | Naya profile banao (full form) |
| `Git Profiles: Edit Profile` | List se profile choose karke edit karo |
| `Git Profiles: Delete Profile` | List se profile choose karke delete karo |
| `Git Profiles: Open Profiles in settings.json` | Seedha `gitProfiles.profiles` khol do |
| `Git Profiles: Set Authentication` | [Authentication](#authentication) setup |
| `Git Profiles: Clear Authentication` | Cached login hatao |
| `Git Profiles: Switch Branch` | [Branch switch karo](#switch-branch--auto-stash-flow) |
| `Git Profiles: Pull` | Current branch pull karo |
| `Git Profiles: Merge Branches...` | [Multi-branch merge](#merge-branches--protected-branches) |
| `Git Profiles: Show Commit History` | [Commit History panel](#commit-history-panel) |
| `Git Profiles: Toggle Training Wheels` | [Training Wheels](#training-wheels) on/off |
| `Git Profiles: Toggle Command Log` | [Command Log](#command-log) on/off |
| `Git Profiles: Set Command Log Location` | Log file ka path file-picker se choose karo |
| `Git Profiles: Open Command Log File` | Log file editor mein kholo |
| `Git Profiles: Show Command Log Terminal` | Log terminal reveal karo |

---

## Project structure

```
extension.js              # Entry point: activate()/deactivate(), saare commands register karta hai
src/
  config.js                # Settings read/write (gitProfiles.profiles)
  terminal.js               # Profile-run shared terminal
  commandLog.js              # Command Log (file + terminal) + Training Wheels toggle
  gitExec.js                   # execGit() — sab git commands isi se chalte hain
  auth.js                       # Set/Clear Authentication
  changes.js                     # stage/unstage/status (Changes section ka core)
  branches.js                     # branches, switch, merge, pull, protected-branch logic
  changesTree.js                    # "Changes" sidebar tree provider
  profilesTree.js                     # "Git Profiles" sidebar tree provider
  profileForm.js                        # Profile create/edit ka webview form
  profileCommands.js                     # Profile CRUD commands
  diffRevert.js                            # Diff viewer, discard, revert
  commitPanel.js                             # Commit webview panel (merge-after-push sahit)
  commitHistoryPanel.js                        # Commit History webview panel
  htmlUtils.js                                  # Shared escapeHtml()
```

---

## Install / Try karne ka tarika (local use ke liye)

### Option A — Debug mode (packaging ki zarurat nahi)

1. Folder VS Code mein kholo.
2. `F5` dabao → "Extension Development Host" window khulega, extension active hoga.
3. Naye window mein activity bar pe **Git Profiles** icon click karo.

### Option B — `.vsix` bana ke install karo (sirf apne liye / manually share karne ke liye)

```bash
npm install -g @vscode/vsce
vsce package
code --install-extension git-profiles-0.1.0.vsix
```

Ye `.vsix` file kisi ko bhi bhej sakte ho — wo `code --install-extension` ya Extensions panel ke
**"Install from VSIX..."** se install kar sakta hai. Lekin isme automatic updates nahi milte aur
discoverability zero hai.

---

## Marketplace pe publish karna (taaki koi bhi search karke install kar sake)

Isse "install from VSIX" ki zarurat nahi rahegi — log seedha VS Code Extensions panel mein
`Git Profiles` search karke ek click mein install kar payenge, aur future updates bhi
automatically mil jayenge.

### Step 1 — Publisher account banao

1. https://dev.azure.com pe jaake free Azure DevOps organization banao (Microsoft/GitHub account
   se sign in ho jayega).
2. https://marketplace.visualstudio.com/manage pe jaake **"Create Publisher"** click karo. Ek
   unique **Publisher ID** choose karo (e.g. `yourname-dev`) — ye baad mein `package.json` ke
   `publisher` field mein jayega.

### Step 2 — Personal Access Token (PAT) banao

1. Azure DevOps → top-right profile icon → **Personal Access Tokens**.
2. **New Token** → Organization: **All accessible organizations** → Scopes: **Custom defined** →
   **Marketplace → Manage** select karo.
3. Token generate hoke ek baar dikhega — **copy karke kahin safe save karo** (dobara nahi
   dikhega).

### Step 3 — Tooling install karo

```bash
npm install -g @vscode/vsce
```

### Step 4 — `package.json` ko finalize karo

Is repo ke `package.json` mein ye cheezein zaroor update karo:

- `"publisher"` → apna Step 1 wala **Publisher ID** (abhi `"local-user"` hai, ye placeholder hai).
- `"name"` → Marketplace pe globally unique hona chahiye (`publisher.name` combo unique hona
  zaroori hai — pehle marketplace pe search karke confirm kar lo ki naam already liya hua nahi
  hai).
- `"repository"` → apna actual GitHub repo URL (recommended, required nahi).
- `"version"` → semantic version (`0.1.0` se start theek hai).
- `icon` (already `media/icon.png` set hai, 128x128 PNG) — chaho to apna custom icon isi path pe
  replace kar do.

### Step 5 — Login aur publish

```bash
# Terminal ko extension folder ke andar rakho
vsce login <your-publisher-id>
# PAT paste karega jab poochega

vsce publish
```

`vsce publish` khud package bhi banayega aur Marketplace pe upload bhi kar dega. Kuch minutes mein
extension https://marketplace.visualstudio.com pe live ho jayega aur VS Code ke andar search
karke milega.

**Future updates ke liye:**

```bash
vsce publish patch   # 0.1.0 -> 0.1.1
vsce publish minor   # 0.1.0 -> 0.2.0
vsce publish major   # 0.1.0 -> 1.0.0
```

Ye version bump khud kar dega aur naya version publish kar dega.

### Bonus — Open VSX (VSCodium / Cursor / other VS Code forks ke liye)

Sirf official Microsoft Marketplace hi nahi, agar VSCodium jaise open-source forks pe bhi
available karna hai:

```bash
npm install -g ovsx
ovsx create-namespace <your-publisher-id>
ovsx publish -p <open-vsx-access-token>
```

(Open VSX token https://open-vsx.org pe apne GitHub account se login karke milta hai — Azure PAT
se alag hai.)

---

## Notes

- Profiles **global settings** mein save hote hain agar koi workspace/folder open nahi hai, warna
  current **workspace settings** (`.vscode/settings.json`) mein — taaki alag-alag projects ke alag
  profiles rakh sako. Save/delete karte waqt extension automatically check karta hai ki setting
  kis-kis scope mein defined hai aur sabhi jagah se sahi tarike se update/delete karta hai (VS Code
  object-settings ko scopes ke beech merge karta hai, isliye sirf ek scope update karna kaafi nahi
  hota).
- Profile ke commands ek terminal mein ek-ek line bhej ke run hote hain (Windows PowerShell `&&`
  support nahi karta, isliye commands `&&` se joint nahi kiye jate).
- Sidebar checkbox state (profile commands ke liye) sirf UI-level filter hai — settings.json mein
  saved list ko change nahi karta.
- "Changes" section ke checkboxes **actual git stage/unstage** karte hain (background mein turant,
  UI optimistically update hoti hai).
- Auto-stash entries (branch switch ke time) `gitProfiles-auto:<branch>` prefix se tag hote hain
  taaki extension pehchan sake ki wo stash kis branch ke liye tha.

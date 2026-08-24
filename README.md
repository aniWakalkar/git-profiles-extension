# Git Profiles — VS Code Extension

Apne Git commands ko **named profiles** mein save karo (Normal, Migration, Frontend, etc.)
aur ek sidebar se checkbox-select karke run karo. Commands kabhi bhi Settings
ya UI se edit/add/delete kar sakte ho.

## 1. Sidebar (Activity Bar) — naya feature

Left activity bar mein ek naya **Git Profiles** icon dikhega. Click karne par:

```
GIT PROFILES
 ├─ ▸ Normal            [▶] [+] [✎] [🗑]
 │     ☑ git add .
 │     ☑ git commit -m "update"
 │     ☑ git push
 ├─ ▸ Migration          [▶] [+] [✎] [🗑]
 │     ☑ git add .
 │     ☐ git commit -m "migration"
 │     ☑ git push origin migration
 └─ [+ New Profile]      [⟳ Refresh]
```

- **Profile par click / ▶ button** → sirf jo commands **checked (☑)** hain,
  wahi terminal mein sequence se run honge (unchecked commands skip ho jayenge).
- **☑ / ☐ checkbox** → har command ke aage, is run ke liye include/exclude karo.
- **+ (Add Command)** → profile mein naya command line add karo (quick single-line add).
- **✎ (Rename)** → profile ka naam change karo.
- **🗑 (Delete)** → profile hata do.
- Har command line pe hover karo to uske apne **✎ Edit** / **🗑 Delete** icons
  bhi milenge.
- Right-click ek profile par → **Select All / Deselect All Commands**.
- View title bar mein **+ (New Profile)** aur **⟳ (Refresh)** buttons hain.

### Full form panel (Name + Commands ek page pe)

`+ New Profile` (view title) ya Command Palette se `Git Profiles: Create New
Profile`/`Git Profiles: Edit Profile` chalane par ab ek **pura tab/page**
khulta hai — chhota popup input box nahi:

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
- **Save Profile** dabate hi profile settings.json mein save ho jata hai aur
  sidebar turant refresh ho jata hai.
- Isi form se profile **rename** bhi ho jata hai — bas Name field change
  karke Save dabao.

### Git command suggestions (autocomplete)

Har command input box pe **click ya type karte hi** ek dropdown khulta hai
jisme common Git commands unki Hinglish description ke saath dikhte hain:

```
[ git c█                              ]
┌──────────────────────────────────────┐
│ git checkout <branch>                 │
│ Kisi existing branch pe switch...     │
├──────────────────────────────────────┤
│ git checkout -b <branch>              │
│ Nayi branch banake usme switch...     │
├──────────────────────────────────────┤
│ git clone <url>                       │
│ Remote repository ko local mein...    │
└──────────────────────────────────────┘
```

- Type karte hi list filter ho jati hai (command naam ya description dono se
  match hoti hai).
- Kisi suggestion pe click karo → wahi command box mein fill ho jata hai.
- List mein `<branch>`, `<url>`, `<file>` jaise placeholders hote hain jinhe
  aapko apne actual values se replace karna hota hai (jaise `<branch>` ko
  `main` ya `feature/login` se).
- Ye sirf ek helper hai — aap chaho to bina list use kiye bhi apna custom
  command directly type kar sakte ho, wo bhi save ho jayega.

Checkbox state sirf current VS Code session ke liye hai (default: sab checked)
— agar kisi run mein kuch commands temporarily skip karne hain to yahan se
uncheck kar do, permanent list settings.json mein hi rahegi.

## 2. Command Palette (`Ctrl+Shift+P`)

| Command | Kaam |
|---|---|
| `Git Profiles: Run Profile` | List se profile select karo → saare commands sequence se run |
| `Git Profiles: Create New Profile` | Naya profile naam + commands enter karke banao |
| `Git Profiles: Edit Profile` | Existing profile ke commands change karo |
| `Git Profiles: Delete Profile` | Profile hata do |
| `Git Profiles: Open Profiles in settings.json` | Seedha settings.json mein `gitProfiles.profiles` khol do |

## 3. settings.json se direct edit (sabse fast)

```json
"gitProfiles.profiles": {
  "Normal": [
    "git add .",
    "git commit -m \"update\"",
    "git push"
  ],
  "Migration": [
    "git add .",
    "git commit -m \"migration\"",
    "git push origin migration"
  ],
  "Frontend": [
    "git add src/",
    "git commit -m \"frontend\"",
    "git push origin frontend"
  ]
}
```

Extra setting: `gitProfiles.runInSameTerminal` (default `true`).

---

## Install / Try karne ka tarika (local use ke liye)

### Option A — Debug mode (packaging ki zarurat nahi)

1. Folder VS Code mein kholo.
2. `F5` dabao → "Extension Development Host" window khulega, extension active hoga.
3. Naye window mein activity bar pe **Git Profiles** icon click karo, ya
   `Ctrl+Shift+P` → `Git Profiles: Run Profile`.

### Option B — `.vsix` bana ke install karo (sirf apne liye / manually share karne ke liye)

```bash
npm install -g @vscode/vsce
vsce package
code --install-extension git-profiles-0.1.0.vsix
```

Ye `.vsix` file kisi ko bhi bhej sakte ho — wo `code --install-extension`
ya Extensions panel ke **"Install from VSIX..."** se install kar sakta hai.
Lekin isme automatic updates nahi milte aur discoverability zero hai.

---

## Marketplace pe publish karna (taaki koi bhi search karke install kar sake)

Isse "install from VSIX" ki zarurat nahi rahegi — log seedha VS Code Extensions
panel mein `Git Profiles` search karke ek click mein install kar payenge, aur
future updates bhi automatically mil jayenge.

### Step 1 — Publisher account banao

1. https://dev.azure.com pe jaake free Azure DevOps organization banao
   (Microsoft/GitHub account se sign in ho jayega).
2. https://marketplace.visualstudio.com/manage pe jaake **"Create Publisher"**
   click karo. Ek unique **Publisher ID** choose karo (e.g. `yourname-dev`) —
   ye baad mein `package.json` ke `publisher` field mein jayega.

### Step 2 — Personal Access Token (PAT) banao

1. Azure DevOps → top-right profile icon → **Personal Access Tokens**.
2. **New Token** → Organization: **All accessible organizations** →
   Scopes: **Custom defined** → **Marketplace → Manage** select karo.
3. Token generate hoke ek baar dikhega — **copy karke kahin safe save karo**
   (dobara nahi dikhega).

### Step 3 — Tooling install karo

```bash
npm install -g @vscode/vsce
```

### Step 4 — `package.json` ko finalize karo

Is repo ke `package.json` mein ye cheezein zaroor update karo:

- `"publisher"` → apna Step 1 wala **Publisher ID** (abhi `"local-user"` hai,
  ye placeholder hai).
- `"name"` → Marketplace pe globally unique hona chahiye (`publisher.name`
  combo unique hona zaroori hai — pehle marketplace pe search karke confirm
  kar lo ki naam already liya hua nahi hai).
- `"repository"` → apna actual GitHub repo URL (recommended, required nahi).
- `"version"` → semantic version (`0.1.0` se start theek hai).
- `icon` (already `media/icon.png` set hai, 128x128 PNG) — chaho to apna
  custom icon isi path pe replace kar do.

### Step 5 — Login aur publish

```bash
# Terminal ko extension folder ke andar rakho
vsce login <your-publisher-id>
# PAT paste karega jab poochega

vsce publish
```

`vsce publish` khud package bhi banayega aur Marketplace pe upload bhi kar
dega. Kuch minutes mein extension https://marketplace.visualstudio.com pe
live ho jayega aur VS Code ke andar search karke milega.

**Future updates ke liye:**

```bash
vsce publish patch   # 0.1.0 -> 0.1.1
vsce publish minor   # 0.1.0 -> 0.2.0
vsce publish major   # 0.1.0 -> 1.0.0
```

Ye version bump khud kar dega aur naya version publish kar dega.

### Bonus — Open VSX (VSCodium / Cursor / other VS Code forks ke liye)

Sirf official Microsoft Marketplace hi nahi, agar VSCodium jaise open-source
forks pe bhi available karna hai:

```bash
npm install -g ovsx
ovsx create-namespace <your-publisher-id>
ovsx publish -p <open-vsx-access-token>
```

(Open VSX token https://open-vsx.org pe apne GitHub account se login karke
milta hai — Azure PAT se alag hai.)

---

## Notes

- Profiles **global settings** mein save hote hain agar koi workspace/folder
  open nahi hai, warna current **workspace settings** (`.vscode/settings.json`)
  mein — taaki alag-alag projects ke alag profiles rakh sako.
- Commands ek terminal mein `&&` se joint karke run hote hain, isliye agar
  koi command fail ho jaye to aage wale commands nahi chalenge.
- Sidebar checkbox state sirf UI-level filter hai (kaunse commands is run mein
  shaamil karne hain) — ye settings.json mein saved list ko change nahi karta.

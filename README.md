# ManimBlocks

Build [Manim](https://www.manim.community/) animations by snapping blocks together (like Scratch). ManimBlocks turns your blocks into real Manim Community Edition Python code.

## Current status (version 0.1.0, all planned features)

| Feature | Status |
|---|---|
| Desktop app (Electron + React + TypeScript) | Built and confirmed working on Windows by the author |
| Block editor, 8 categories, ~45 blocks; code generation; Problems panel | Built, unit-tested; every block except MathTex rendered with real Manim |
| Private Python 3.12 + Manim + FFmpeg install (no system install), folders of your choice, disk-space checks | Built; tested on Linux and by the **E2E** workflow on Windows |
| Preview (quick) and Render (final) with progress, cancel, safety check, readable errors | Built, same testing |
| In-app video player: play/pause/restart/seek/time/fullscreen | Built and confirmed working |
| Projects: New/Open/Save/Save as (`.manimblocks`), recents, autosave + crash recovery, unsaved-changes prompts | Built; logic unit-tested |
| Open a `.manimblocks` file by double-clicking it | Built (installer registers the file type); untested |
| Settings: theme (dark/light), preview/render quality, frame rate, export folder, auto-update check, versions | Built; untested in a real window |
| LaTeX for MathTex: finds your LaTeX, or installs a private TinyTeX (Windows) | Detection tested with real TeX Live; the TinyTeX install is checked only by the **E2E** workflow |
| Updates from GitHub Releases: check, notes, download with progress, confirm, install, remind later | Built with electron-updater; consent rules unit-tested; real update untested |
| Installer with a choosable install folder, per-user | Built by GitHub Actions; packaging checked, installer itself untested |
| Manual Python editing / Monaco | **Not built** (see below) |

**Why no manual Python editing:** the app only runs programs that pass a strict safety check (only the Manim operations the blocks can produce). Free-form Python could not pass that check, and running it unchecked would defeat it. The Python panel is read-only; Copy and Export .py give you the code to run yourself.

### Honest status
- The generator, installer logic, renderer, file handling and update rules are covered by automated tests, and a real Manim render of every block (MathTex with real TeX Live) was run during development.
- Things only a real Windows machine can confirm: the new Settings window, update flow, file association, the TinyTeX install and the installer wizard itself. Report anything odd.
- **MathTex needs LaTeX.** Settings > LaTeX can install a private copy (TinyTeX) on Windows. TinyTeX's package source follows the newest TeX Live, so after TeX Live's yearly release (spring) the pinned copy may need a version bump; the app then tells you to use MiKTeX.
- Releases are not signed, so Windows SmartScreen will show "unknown publisher" until a code-signing certificate is added.
- The **E2E** workflow (Actions tab) installs everything and renders a real video on a Windows machine. If it is green, the Windows install-and-render path works.

## Try it (developers)
1. Install [Node.js LTS](https://nodejs.org/) (one installer, accept the defaults).
2. Open a terminal in the project folder and run:
   ```
   npm install
   npm run dev
   ```
   The app window opens. Edits to the source reload automatically.

Other commands: `npm test` (tests), `npm run check` (type-check + tests + build, what CI runs), `npm start` (run the built app), `npm run dist` (build the installer locally into `release/`).

## Put it on GitHub (no Git knowledge needed)
1. Open https://github.com/romclik/manimblocks, click **Add file -> Upload files**.
2. Drag in everything from this project folder (include the `.github` folder; do **not** include `node_modules`, `dist` or `release`).
3. Click **Commit changes**. The **Actions** tab will start running **CI** automatically. A green check means the tests and build pass.

## Publish a release (installer)
1. Check `version` in `package.json` (e.g. `0.1.0`).
2. On GitHub: **Releases -> Draft a new release**. Create the tag `v0.1.0` (the letter `v` plus the same version). Write notes. Click **Publish release**.
3. The **Release** workflow builds the installer (about 5 minutes) and attaches `ManimBlocks-Setup-0.1.0.exe` to that release. If the tag and `package.json` version differ, it stops with a clear message.

For the next version: raise `version` in `package.json`, commit, then repeat step 2 with the new tag.

## Installer
The installer is an NSIS wizard (it also registers `.manimblocks` files) with an **Choose install location** page, so users can pick any drive (for example `D:\Programs\ManimBlocks`). It installs per-user and does not require C:\Program Files. On first launch a setup screen lets users choose where Python/Manim, the download cache and temporary render files go (for example on another drive), checks free space, then installs. By default the data folder is a sibling of the install folder named `<install folder>-data` (not inside it), so uninstalling or updating the app never deletes your environment. Only a tiny settings file stays in the Windows user profile.

## Project layout
- `electron/` desktop shell (main process and secure preload bridge)
- `src/blocks/` block definitions and toolbox
- `src/codegen/` Blockly state to Manim Python (pure TypeScript, tested)
- `src/components/`, `src/App.tsx` the interface
- `.github/workflows/` CI and release automation

## Security notes
Users never type Python. Numbers are parsed by a small validator, colors come from a fixed list, text is escaped and variable names are sanitized before reaching generated code. Tests try to inject code through every field type.

## License
MIT, see `LICENSE`.

## How rendering works
The app ships a small tool called [`uv`](https://github.com/astral-sh/uv) (downloaded by `npm install` with a pinned checksum, bundled into the installer). On first launch it uses `uv` to download Python 3.12 and install Manim 0.22.1 plus FFmpeg into the folders you chose. Renders run in a separate process, so the window stays responsive, and can be canceled. Before anything runs, a safety check (`electron/core/validate_scene.py`) verifies the generated program contains only the Manim operations ManimBlocks can produce.

## Automatic updates (how to publish and test them)
The app checks GitHub Releases about 15 seconds after start and every 6 hours (switch off in Settings). When a newer version exists it shows a bar with **Download**, **Release notes** and **Remind me later**. Nothing is downloaded until you click Download, and nothing is installed until you click **Install and restart** and confirm. Downloads are verified with the SHA-512 checksum in `latest.yml`. Updates reinstall into the same folder you chose. (Releases are unsigned, so there is no publisher-signature check until you add a code-signing certificate.)

To test it: install `0.1.0` from a release, raise `version` in `package.json` to `0.1.1`, commit, publish a release with tag `v0.1.1`, wait for the Release workflow, then open the installed 0.1.0 app and use Settings > Check for updates.

## Test installers without publishing
The **Build installer (test build)** workflow builds the installer on every push. Open the run in the Actions tab and download it under **Artifacts**.

# ManimBlocks

Build [Manim](https://www.manim.community/) animations by snapping blocks together (like Scratch). ManimBlocks turns your blocks into real Manim Community Edition Python code.

## Current status (version 0.1.0, stages 1-5)

| Feature | Status |
|---|---|
| Desktop app window (Electron + React + TypeScript) | Built; **not yet run on Windows by the author's tooling** (see "Honest status") |
| Block editor: drag, connect, delete, duplicate, zoom, undo/redo | Built (Blockly) |
| 8 block categories (objects, animations, properties, timing, camera, logic, variables) | Built |
| Python code generation + live code panel, Copy, Export .py | Built and unit-tested |
| Problems panel (click a problem to jump to the block) | Built |
| Setup screen: choose folders for Python env, cache, temp; disk-space checks | Built |
| Auto-install of Python 3.12 + Manim + FFmpeg (private, via `uv`) | Built; tested on Linux, Windows test runs in the **E2E** workflow |
| Render to MP4 with progress, cancel, safety check, error messages | Built; same testing status |
| Open / show / export the rendered MP4 | Built (untested on Windows) |
| In-app video preview: play, pause, restart, seek, time, fullscreen, auto-refresh after render | Built; seeking server unit-tested, the player itself untested on Windows |
| LaTeX for MathTex | **Not automatic**: install MiKTeX yourself (the app tells you) |
| Save/open projects, autosave, recovery | **Not built yet** (stage 6) |
| Auto-update from GitHub Releases | **Not built yet** (stage 9) |
| Windows installer with a choosable install folder | Configured and built by GitHub Actions; **untested** |

### Honest status
- The code generator is tested: the unit tests compile the generated Python, and a program using every block except MathTex was rendered with real Manim 0.22.1.
- The Electron window, the Blockly UI and the installer were **not run on a real Windows PC** while writing this. Expect to find small bugs on first launch; report them.
- **MathTex needs a LaTeX installation** (e.g. MiKTeX). Automatic LaTeX setup is not built yet; the app shows a clear message instead.
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
The installer is an NSIS wizard with an **Choose install location** page, so users can pick any drive (for example `D:\Programs\ManimBlocks`). It installs per-user and does not require C:\Program Files. On first launch a setup screen lets users choose where Python/Manim, the download cache and temporary render files go (for example on another drive), checks free space, then installs. By default the data folder is `data` inside the install folder. Only a tiny settings file stays in the Windows user profile.

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

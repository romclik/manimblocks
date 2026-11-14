'use strict';
// Wraps electron-updater so that NOTHING is downloaded or installed without an explicit user action.
const HOUR = 3600 * 1000;
const NOTES_URL = (repo, v) => `https://github.com/${repo}/releases/tag/v${v}`;

// Semantic-version comparison. A pre-release (0.3.0-beta.2) is older than its release (0.3.0).
const parse = (v) => {
  const [core, ...rest] = String(v).replace(/^v/, '').split('+')[0].split('-');
  return { nums: core.split('.').map((n) => parseInt(n, 10) || 0), pre: rest.length ? rest.join('-').split('.') : [] };
};
function isNewer(a, b) {
  const x = parse(a), y = parse(b);
  for (let i = 0; i < Math.max(x.nums.length, y.nums.length, 3); i++) { if ((x.nums[i] || 0) !== (y.nums[i] || 0)) return (x.nums[i] || 0) > (y.nums[i] || 0); }
  if (!x.pre.length || !y.pre.length) return !x.pre.length && y.pre.length > 0; // release beats pre-release; two releases are equal
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    const p = x.pre[i], q = y.pre[i];
    if (p === undefined) return false;
    if (q === undefined) return true;
    if (p === q) continue;
    const pn = /^\d+$/.test(p), qn = /^\d+$/.test(q);
    if (pn && qn) return Number(p) > Number(q);
    if (pn !== qn) return qn; // numbers sort before words
    return p > q;
  }
  return false;
}

/** Release notes come from GitHub as HTML: reduce them to safe plain text. */
function notesToText(n) {
  const raw = Array.isArray(n) ? n.map((x) => (x && x.note) || '').join('\n\n') : typeof n === 'string' ? n : '';
  return raw
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<\s*(br|\/p|\/li|\/h[1-6]|\/div)\s*\/?>/gi, '\n').replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n').trim().slice(0, 6000);
}

function friendly(err) {
  const m = String((err && err.message) || err);
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|ECONNRESET|network|net::/i.test(m)) return 'Could not reach GitHub. Check your internet connection and try again.';
  if (/404|latest\.yml|Cannot find|No published versions/i.test(m)) return 'No update information was found on GitHub yet.';
  if (/sha512|checksum|integrity/i.test(m)) return 'The downloaded update failed its integrity check and was discarded.';
  return m.split('\n')[0].slice(0, 200);
}

function createUpdater({ autoUpdater, getPrefs, setPrefs, currentVersion, isPackaged, send = () => {}, now = Date.now, repo = 'romclik/manimblocks' }) {
  let state = { status: 'idle', current: currentVersion };
  const set = (patch) => { state = { current: currentVersion, ...patch }; send('update:state', state); };

  // The safety settings: no automatic download, no install on quit.
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.autoRunAppAfterInstall = true;
  autoUpdater.allowPrerelease = false;
  autoUpdater.allowDowngrade = false;

  autoUpdater.on('update-available', (info) => {
    if (!isNewer(info.version, currentVersion)) return set({ status: 'none', checkedAt: now() });
    set({ status: 'available', version: info.version, notes: notesToText(info.releaseNotes), url: NOTES_URL(repo, info.version) });
  });
  autoUpdater.on('update-not-available', () => set({ status: 'none', checkedAt: now() }));
  autoUpdater.on('download-progress', (p) => set({ ...state, status: 'downloading', percent: Math.round(p.percent || 0) }));
  autoUpdater.on('update-downloaded', () => set({ ...state, status: 'downloaded', percent: 100 }));
  autoUpdater.on('error', (err) => set({ status: 'error', error: friendly(err), version: state.version }));

  return {
    state: () => state,
    async check({ manual = false } = {}) {
      if (!isPackaged) { if (manual) set({ status: 'unsupported', error: 'Updates only work in the installed app, not in a development copy.' }); return state; }
      if (['checking', 'downloading', 'downloaded'].includes(state.status)) return state;
      const prefs = getPrefs();
      autoUpdater.allowPrerelease = prefs.updatePrereleases === true; // off by default: only stable releases
      if (!manual && (!prefs.autoUpdate || now() < prefs.remindUntil)) return state;
      set({ status: 'checking' });
      try { await autoUpdater.checkForUpdates(); } catch (err) { set({ status: 'error', error: friendly(err) }); }
      if (state.status === 'checking') set({ status: 'none', checkedAt: now() });
      return state;
    },
    async download() {
      if (state.status !== 'available') return state;
      set({ ...state, status: 'downloading', percent: 0 });
      try { await autoUpdater.downloadUpdate(); } catch (err) { set({ status: 'error', error: friendly(err), version: state.version }); }
      return state;
    },
    /** Returns true if the installer was started. The caller must already have the user's confirmation. */
    install() {
      if (state.status !== 'downloaded') return false;
      autoUpdater.quitAndInstall(false, true);
      return true;
    },
    remindLater() {
      setPrefs({ remindUntil: now() + 24 * HOUR, remindVersion: state.version || '' });
      set({ status: 'idle' });
      return state;
    },
  };
}
module.exports = { createUpdater, isNewer, notesToText, friendly, NOTES_URL };

'use strict';
const fs = require('fs');
const path = require('path');

const derive = (root) => ({ root, pythonEnv: path.join(root, 'python'), cache: path.join(root, 'cache'), temp: path.join(root, 'temp') });
const valid = (l) => l && ['root', 'pythonEnv', 'cache', 'temp'].every((k) => typeof l[k] === 'string' && path.isAbsolute(l[k]));

function load(file) {
  try {
    const s = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (s && s.configured && valid(s.locations)) return { configured: true, locations: s.locations };
  } catch { /* first launch or unreadable file */ }
  return { configured: false, locations: null };
}
function save(file, locations) {
  if (!valid(locations)) throw new Error('Every location must be a full folder path, such as D:\\ManimBlocks.');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ configured: true, locations }, null, 2));
}
module.exports = { derive, load, save, valid };

const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// NOTE: el índice de cartas vive dentro de app/src/data/ y se importa como
// `./index.json` desde loadIndex.ts — ya no hace falta extender watchFolders a
// la raíz del repo. Hacerlo provocaba que Metro rastreara carpetas pesadas de
// la raíz (p.ej. venv_optcg/, el virtualenv de Python) y reventara en
// createFileMap-fork.js.

module.exports = config;

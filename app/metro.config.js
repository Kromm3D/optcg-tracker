// Permite a Metro resolver ficheros fuera de app/ (necesario para que el
// `require('../data/index.json')` que hace src/data/loadIndex.ts encuentre
// el índice generado por scripts/build_card_database.py en la raíz del repo.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);
config.watchFolders = [repoRoot];
config.resolver.assetExts = [...config.resolver.assetExts, 'json'];

module.exports = config;

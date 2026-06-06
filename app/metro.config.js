const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Allow Metro to serve the card database from the repo root (../data)
config.watchFolders = [path.resolve(__dirname, '..')];

// Treat .onnx as a binary asset so Metro doesn't try to parse it as JS
config.resolver.assetExts = [...config.resolver.assetExts, 'onnx'];

module.exports = config;

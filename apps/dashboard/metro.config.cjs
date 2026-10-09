const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');
const config = getDefaultConfig(__dirname);
// Isolated nested app, deliberately NOT an npm workspace: preserve the Vite dependency tree.
// Watch only the existing shared mock identity factory, resolving packages in this app.
config.watchFolders = [path.resolve(__dirname, '../../src/mock')];
config.resolver.disableHierarchicalLookup = true;
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules')];
module.exports = config;

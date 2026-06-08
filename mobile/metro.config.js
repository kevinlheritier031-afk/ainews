const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Force CJS resolution for packages with ESM/CJS conflicts (e.g. @supabase/supabase-js)
config.resolver.unstable_enablePackageExports = false;

module.exports = config;

/**
 * PERF-106: Frontend bundle analysis and size optimization.
 * next.config.ts integration snippet — wraps the config with bundle analyzer.
 *
 * Install: npm install @next/bundle-analyzer --save-dev
 * Run:     ANALYZE=true npm run build
 */
const withBundleAnalyzer =
  process.env.ANALYZE === 'true'
    ? require('@next/bundle-analyzer')({ enabled: true })
    : (config: unknown) => config;

module.exports = withBundleAnalyzer;
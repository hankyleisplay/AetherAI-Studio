// Injected at build time from the root package.json (see vite.config.ts); there is nothing to keep in sync by hand.
declare const __APP_VERSION__: string;

export const APP_VERSION: string = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';

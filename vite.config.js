import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    exclude: ['**/node_modules/**', '**/*.rules.test.js'],
    // Every *Actions.test.js / rules.test.js file spins up its own
    // @firebase/rules-unit-testing environment, but they all point at the
    // same hardcoded emulator project ID ('motolite-ims-test') and each
    // calls testEnv.clearFirestore() in its own beforeEach. Running test
    // FILES in parallel (Vitest's default) lets one file's clearFirestore()
    // wipe fixture data another file just wrote and is mid-test on,
    // producing intermittent "profile not found" / permission-denied
    // failures that have nothing to do with the actual rules or app logic.
    // Serializing file execution removes that cross-file interference.
    fileParallelism: false,
  },
});

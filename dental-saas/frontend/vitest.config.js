import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
            '@packages': path.resolve(__dirname, '../packages'), // ✅ ADD THIS
        },
    },
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: ['./tests/setup.js'],
        include: ['tests/**/*.test.{js,jsx}', 'src/**/*.test.{js,jsx}'],
    },
});
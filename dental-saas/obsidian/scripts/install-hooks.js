/**
 * Installs a git post-commit hook that auto-syncs the Obsidian vault.
 * 
 * Usage: node obsidian/scripts/install-hooks.js
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const HOOKS_DIR = path.join(PROJECT_ROOT, '.git', 'hooks');

const hookContent = `#!/bin/sh
# Auto-sync Obsidian vault after every commit
echo "🦷 Syncing Obsidian vault..."
node obsidian/scripts/sync-vault.js
echo "✅ Obsidian vault synced"
`;

function install() {
  if (!fs.existsSync(HOOKS_DIR)) {
    console.log('❌ No .git/hooks directory found. Is this a git repository?');
    process.exit(1);
  }

  const hookPath = path.join(HOOKS_DIR, 'post-commit');
  
  // Check if hook already exists
  if (fs.existsSync(hookPath)) {
    const existing = fs.readFileSync(hookPath, 'utf-8');
    if (existing.includes('sync-vault.js')) {
      console.log('✅ Hook already installed!');
      return;
    }
    // Append to existing hook
    fs.appendFileSync(hookPath, '\n' + hookContent.split('\n').slice(1).join('\n'));
    console.log('✅ Appended vault sync to existing post-commit hook');
  } else {
    fs.writeFileSync(hookPath, hookContent, { mode: 0o755 });
    console.log('✅ Installed post-commit hook for vault sync');
  }
}

install();

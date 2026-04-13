/**
 * DentalSaaS Obsidian Vault Sync Script
 * 
 * Scans the codebase and updates Obsidian documentation with:
 * - File counts per domain
 * - Model names extracted from code
 * - Route endpoints extracted from route files
 * - Last sync timestamp
 * 
 * Usage: node obsidian/scripts/sync-vault.js
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const VAULT_ROOT = path.resolve(__dirname, '..');

// ─── Helpers ────────────────────────────────────────────────────────────────

function countFiles(dir, ext = '.js') {
  let count = 0;
  if (!fs.existsSync(dir)) return 0;
  const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'coverage', '.obsidian', '__pycache__', '.venv', 'venv', '.cache']);
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (SKIP_DIRS.has(entry.name)) continue;
      if (entry.isDirectory()) {
        count += countFiles(fullPath, ext);
      } else if (entry.name.endsWith(ext) || entry.name.endsWith('.jsx') || entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
        count++;
      }
    }
  } catch (e) { /* skip unreadable dirs */ }
  return count;
}

function extractModels(dir) {
  const models = [];
  if (!fs.existsSync(dir)) return models;
  
  function scan(d) {
    try {
      const entries = fs.readdirSync(d, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(d, entry.name);
        if (entry.isDirectory() && entry.name !== 'node_modules' && !['node_modules', '.git', '.next', 'dist', 'build', 'coverage', '.cache'].includes(entry.name)) {
          scan(fullPath);
        } else if (entry.name.endsWith('.model.js') || entry.name.endsWith('.model.ts')) {
          const name = entry.name.replace('.model.js', '').replace('.model.ts', '');
          models.push(name);
        }
      }
    } catch (e) { /* skip */ }
  }
  scan(dir);
  return models;
}

function extractRouteFiles(dir) {
  const routes = [];
  if (!fs.existsSync(dir)) return routes;
  
  function scan(d) {
    try {
      const entries = fs.readdirSync(d, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(d, entry.name);
        if (entry.isDirectory() && !['node_modules', '.git', '.next', 'dist', 'build', 'coverage', '.cache'].includes(entry.name)) {
          scan(fullPath);
        } else if (entry.name.endsWith('.routes.js') || entry.name.endsWith('.route.js') || entry.name.endsWith('Routes.js')) {
          routes.push(entry.name.replace('.js', ''));
        }
      }
    } catch (e) { /* skip */ }
  }
  scan(dir);
  return routes;
}

function extractMiddleware(dir) {
  const middleware = [];
  const mwDir = path.join(dir, 'middleware');
  if (!fs.existsSync(mwDir)) return middleware;
  try {
    const entries = fs.readdirSync(mwDir);
    for (const entry of entries) {
      if (entry.endsWith('.js') || entry.endsWith('.ts')) {
        middleware.push(entry.replace('.js', '').replace('.ts', ''));
      }
    }
  } catch (e) { /* skip */ }
  return middleware;
}

function getDirList(dir) {
  if (!fs.existsSync(dir)) return [];
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter(e => e.isDirectory() && e.name !== 'node_modules' && e.name !== '.git' && e.name !== '.obsidian')
      .map(e => e.name);
  } catch (e) { return []; }
}

function timestamp() {
  return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

// ─── Domain Mapping ─────────────────────────────────────────────────────────

const BACKEND_SRC = path.join(PROJECT_ROOT, 'backend', 'src');
const FRONTEND_SRC = path.join(PROJECT_ROOT, 'frontend', 'src');

const domainMap = {
  'Patient Domain': {
    backendPaths: ['modules/patientDomain'],
    description: 'Patient records, demographics, medical history, and intake workflows.'
  },
  'Appointment Domain': {
    backendPaths: ['modules/appointmentDomain', 'modules/booking'],
    description: 'Scheduling, calendar management, and booking workflows.'
  },
  'Treatment Domain': {
    backendPaths: ['modules/treatments', 'modules/procedures', 'modules/clinicalProtocolDomain'],
    description: 'Treatment planning, procedures, and clinical protocol management.'
  },
  'Orthodontic Domain': {
    backendPaths: ['modules/orthodonticDomain', 'modules/orthodontics', 'modules/alignerProductionDomain', 'modules/stageDomain'],
    description: 'Case management, STL processing, treatment staging, and aligner production.'
  },
  'Finance Domain': {
    backendPaths: ['modules/financeDomain', 'modules/financialDomain', 'modules/invoices', 'modules/payments'],
    description: 'Clinic-level invoicing, payments, and insurance claims.'
  },
};

const systemMap = {
  'Billing Engine': {
    backendPaths: ['platform/billing'],
    description: 'Enterprise-grade financial infrastructure — subscription, invoicing, payments, ledger.'
  },
  'Security Architecture': {
    backendPaths: ['platform/policies', 'platform/guardian', 'rbac', 'middleware'],
    description: 'Zero-trust security — RBAC, PBAC, RLS, database isolation.'
  },
  'Event System': {
    backendPaths: ['events', 'listeners', 'jobs', 'email'],
    description: 'BullMQ queuing, event bus, email delivery with Handlebars.'
  },
  'Entitlement System': {
    backendPaths: ['core/usage', 'core/storage', 'core/subscription'],
    description: 'Module gating, seat limits, storage quotas, and real-time usage tracking (Phase 4.0).'
  },
};

// ─── Generate Stats Page ────────────────────────────────────────────────────

function generateStatsPage() {
  const backendFiles = countFiles(BACKEND_SRC);
  const frontendFiles = countFiles(FRONTEND_SRC);
  const allModels = extractModels(BACKEND_SRC);
  const allRoutes = extractRouteFiles(BACKEND_SRC);
  const allMiddleware = extractMiddleware(BACKEND_SRC);
  const backendDomains = getDirList(path.join(BACKEND_SRC, 'modules'));
  const platformDirs = getDirList(path.join(BACKEND_SRC, 'platform'));

  let content = `# 📊 Project Stats\n\n`;
  content += `> Auto-generated by vault sync script. Last updated: **${timestamp()}**\n\n`;
  
  content += `## Codebase Size\n`;
  content += `| Area | File Count |\n|------|------------|\n`;
  content += `| Backend | ${backendFiles} files |\n`;
  content += `| Frontend | ${frontendFiles} files |\n`;
  content += `| **Total** | **${backendFiles + frontendFiles} files** |\n\n`;

  content += `## Backend Domains (${backendDomains.length})\n`;
  for (const domain of backendDomains.sort()) {
    const count = countFiles(path.join(BACKEND_SRC, 'modules', domain));
    content += `- \`${domain}\` — ${count} files\n`;
  }
  content += `\n`;

  content += `## Platform Modules (${platformDirs.length})\n`;
  for (const dir of platformDirs.sort()) {
    const count = countFiles(path.join(BACKEND_SRC, 'platform', dir));
    content += `- \`${dir}\` — ${count} files\n`;
  }
  content += `\n`;

  content += `## Models (${allModels.length})\n`;
  for (const model of allModels.sort()) {
    content += `- \`${model}\`\n`;
  }
  content += `\n`;

  content += `## Route Files (${allRoutes.length})\n`;
  for (const route of allRoutes.sort()) {
    content += `- \`${route}\`\n`;
  }
  content += `\n`;

  content += `## Middleware (${allMiddleware.length})\n`;
  for (const mw of allMiddleware.sort()) {
    content += `- \`${mw}\`\n`;
  }
  content += `\n`;

  content += `---\n#stats #auto-generated\n`;

  const outPath = path.join(VAULT_ROOT, 'Reference', 'Project Stats.md');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, content, 'utf-8');
  console.log(`  ✅ Project Stats updated`);
}

// ─── Generate Domain Detail Pages ───────────────────────────────────────────

function updateDomainStats() {
  for (const [name, config] of Object.entries(domainMap)) {
    const statsFile = path.join(VAULT_ROOT, 'Domains', `${name} — Stats.md`);
    
    let totalFiles = 0;
    let allModels = [];
    let allRoutes = [];
    
    for (const bp of config.backendPaths) {
      const fullPath = path.join(BACKEND_SRC, bp);
      totalFiles += countFiles(fullPath);
      allModels.push(...extractModels(fullPath));
      allRoutes.push(...extractRouteFiles(fullPath));
    }

    let content = `# ${name} — Stats\n\n`;
    content += `> Auto-generated. Last synced: **${timestamp()}**\n\n`;
    content += `📝 ${config.description}\n\n`;
    content += `## Overview\n`;
    content += `| Metric | Value |\n|--------|-------|\n`;
    content += `| Total Files | ${totalFiles} |\n`;
    content += `| Models | ${allModels.length} |\n`;
    content += `| Route Files | ${allRoutes.length} |\n\n`;
    
    if (allModels.length > 0) {
      content += `## Models\n`;
      for (const m of allModels.sort()) content += `- \`${m}\`\n`;
      content += `\n`;
    }

    if (allRoutes.length > 0) {
      content += `## Routes\n`;
      for (const r of allRoutes.sort()) content += `- \`${r}\`\n`;
      content += `\n`;
    }

    content += `## Source Paths\n`;
    for (const bp of config.backendPaths) {
      content += `- \`backend/src/${bp}/\`\n`;
    }
    content += `\n`;

    content += `## Related\n- [[${name}]]\n\n`;
    content += `---\n#stats #auto-generated #${name.toLowerCase().replace(/\s/g, '-')}\n`;

    fs.mkdirSync(path.dirname(statsFile), { recursive: true });
    fs.writeFileSync(statsFile, content, 'utf-8');
    console.log(`  ✅ ${name} stats updated`);
  }
}

// ─── Generate System Stats ──────────────────────────────────────────────────

function updateSystemStats() {
  for (const [name, config] of Object.entries(systemMap)) {
    const statsFile = path.join(VAULT_ROOT, 'Systems', `${name} — Stats.md`);
    
    let totalFiles = 0;
    let allModels = [];
    
    for (const bp of config.backendPaths) {
      const fullPath = path.join(BACKEND_SRC, bp);
      totalFiles += countFiles(fullPath);
      allModels.push(...extractModels(fullPath));
    }

    let content = `# ${name} — Stats\n\n`;
    content += `> Auto-generated. Last synced: **${timestamp()}**\n\n`;
    content += `📝 ${config.description}\n\n`;
    content += `| Metric | Value |\n|--------|-------|\n`;
    content += `| Total Files | ${totalFiles} |\n`;
    content += `| Models | ${allModels.length} |\n\n`;
    
    if (allModels.length > 0) {
      content += `## Models\n`;
      for (const m of allModels.sort()) content += `- \`${m}\`\n`;
      content += `\n`;
    }

    content += `## Source Paths\n`;
    for (const bp of config.backendPaths) {
      content += `- \`backend/src/${bp}/\`\n`;
    }
    content += `\n`;

    content += `## Related\n- [[${name}]]\n\n`;
    content += `---\n#stats #auto-generated\n`;

    fs.mkdirSync(path.dirname(statsFile), { recursive: true });
    fs.writeFileSync(statsFile, content, 'utf-8');
    console.log(`  ✅ ${name} stats updated`);
  }
}

// ─── Generate Changelog Entry ───────────────────────────────────────────────

function appendChangelog() {
  const changelogPath = path.join(VAULT_ROOT, 'Planning', 'Sync Log.md');
  const now = timestamp();
  
  let existing = '';
  if (fs.existsSync(changelogPath)) {
    existing = fs.readFileSync(changelogPath, 'utf-8');
  } else {
    existing = `# 🔄 Sync Log\n\n> Automated sync history from vault sync script.\n\n| Date | Action |\n|------|--------|\n`;
  }

  // Insert new entry after the table header
  const lines = existing.split('\n');
  const headerIdx = lines.findIndex(l => l.startsWith('|---'));
  if (headerIdx !== -1) {
    lines.splice(headerIdx + 1, 0, `| ${now} | Full vault sync completed |`);
  }

  fs.mkdirSync(path.dirname(changelogPath), { recursive: true });
  fs.writeFileSync(changelogPath, lines.join('\n'), 'utf-8');
  console.log(`  ✅ Sync log updated`);
}

// ─── Main ───────────────────────────────────────────────────────────────────

function main() {
  console.log(`\n🦷 DentalSaaS Obsidian Vault Sync`);
  console.log(`   Project: ${PROJECT_ROOT}`);
  console.log(`   Vault:   ${VAULT_ROOT}`);
  console.log(`   Time:    ${timestamp()}\n`);

  console.log(`📊 Generating project stats...`);
  generateStatsPage();

  console.log(`\n📂 Updating domain stats...`);
  updateDomainStats();

  console.log(`\n⚙️  Updating system stats...`);
  updateSystemStats();

  console.log(`\n📝 Logging sync...`);
  appendChangelog();

  console.log(`\n✅ Vault sync complete!\n`);
}

main();

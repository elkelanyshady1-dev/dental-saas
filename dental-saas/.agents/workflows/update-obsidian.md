---
description: Sync the Obsidian documentation vault with the latest codebase state
---

# Update Obsidian Vault

This workflow syncs the Obsidian documentation vault at `obsidian/` with the current state of the dental-saas codebase.

## Steps

// turbo-all

1. Run the vault sync script to update auto-generated stats pages:
```bash
node obsidian/scripts/sync-vault.js
```

2. If the user requests deeper updates (architecture changes, new domains, etc.), manually review and update the relevant pages in:
   - `obsidian/Architecture/` — Plane-level docs
   - `obsidian/Systems/` — Core system docs  
   - `obsidian/Domains/` — Clinical domain docs
   - `obsidian/Reference/` — API, deployment, monitoring

3. For new backend domains that don't have documentation yet, create a new page in `obsidian/Domains/` following the existing template pattern.

4. For new systems or architectural changes, update the relevant page in `obsidian/Systems/` or `obsidian/Architecture/`.

## Notes
- Auto-generated pages are marked with `#auto-generated` tag in Obsidian
- Hand-written architecture docs are NOT overwritten by the sync script
- The sync script only generates/updates `*— Stats.md` files and `Project Stats.md`

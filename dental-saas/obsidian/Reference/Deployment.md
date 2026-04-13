# Deployment

> CI/CD, environments, and deployment procedures.

## Environments
| Environment | Purpose |
|-------------|---------|
| Development | Local development |
| Staging | Pre-production testing |
| Production | Live system |

## Stack
- **Backend**: Node.js
- **Frontend**: React (Vite)
- **Database**: MongoDB (per-org isolation)
- **Queue**: Redis + BullMQ
- **AI Engine**: Python + PyTorch

## CI/CD
- GitHub Actions (`.github/` workflows)
- See: `Makefile` for common commands

## Related
- [[Monitoring]]
- [[Database Isolation]]

---
#devops #deployment

# Pricing Engine

## Resolution Order
To ensure financial integrity and flexibility, pricing is resolved in this order:
1. **Country Override**: Specific price set for a single country (e.g., Special price for Egypt).
2. **Region Default**: The standard price for the region (e.g., MEA, EU).
3. **Global Default**: Legacy fallback price.

## Validation Rules
- **No Zero Price**: Unless explicitly marked as a "Free" tier.
- **Currency Match**: Region prices must use the region's default currency (determined by [[RegionMapping]]).
- **Discount Cap**: Prevents setting monthly prices higher than yearly/12.

## Dependencies
- [[RegionMapping]] — Maps countries to regions.
- [[PricingResolver]] — Backend implementation of these rules.

## Modes
- **v2**: Simple country-based mapping (Legacy).
- **v3**: Region-first with localized overrides (Production).

## Status
**v3 ACTIVE** — Rollout completed with Phase 4.0 hardening.

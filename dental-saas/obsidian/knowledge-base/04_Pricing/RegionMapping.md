# Region Mapping

## Core Regions
The system categorizes the world into 4 primary economic regions:
- **US** (United States / North America)
- **EU** (European Union / UK)
- **MEA** (Middle East & Africa)
- **APAC** (Asia-Pacific)

## Source
Defined in `backend/src/core/geo/regionConstants.js`.

## Rule
- Every country code (ISO-2) must map to exactly **ONE** region.
- Unmapped countries fallback to the **Global/MEA** default region.

## Dependencies
- [[PricingEngine]] — Uses these mappings to apply rates.

## Status
**REQUIRED** — Immutable mapping for pricing consistency.

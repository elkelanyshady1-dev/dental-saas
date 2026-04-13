# Region Card Component

## Purpose
Unified UI component for managing pricing, exclusions, and overrides within a specific geographical region.

## Features
- **Price Control**: Edit monthly and yearly rates for the entire region.
- **Exclusion Toggle**: Disable the plan for specific countries within the region.
- **Country Overrides**: Inline form to set custom pricing for high-variance markets (e.g., Egypt, UAE).
- **Currency Display**: Shows prices in the region's authoritative currency.

## Dependencies
- [[PlanBuilder]] — Parent page component.
- [[PricingEngine]] — Validates price bounds and currency.

## Location
`frontend/src/platform/components/plans/RegionCardV3.jsx`

## Status
**NEW** — Key feature of the Plan Builder v3 upgrade.

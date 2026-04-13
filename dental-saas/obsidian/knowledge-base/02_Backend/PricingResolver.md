# Pricing Resolver

## Purpose
Determine the final applicable price for a plan based on the organization's country and region.

## Input
- `planVersion` (Object)
- `countryCode` (String, ISO 3166-1 alpha-2)

## Output
- `currency` (String)
- `monthly` (Number)
- `yearly` (Number)
- `regionId` (String)
- `isOverride` (Boolean)

## Logic (v3)
The resolver follows a strict hierarchy to find the price:
1. **Country Override**: Checks `pricingV3.countryOverrides` for the specific country.
2. **Region Default**: If no override, finds the region the country belongs to in `pricingV3.regions`.
3. **Global Default**: Fallback to `pricing` (v2) if v3 data is missing or incomplete.

## Files
- `backend/src/platform/billing/services/pricingResolver.service.js`

## Dependencies
- [[PricingEngine]] — Business rules and resolution order
- [[RegionMapping]] — Country-to-region lookup

## Status
**ACTIVE** — Core of the v3 pricing rollout.

# Pricing Audit

## Purpose
Automated and manual checks to ensure the integrity of the pricing and billing lifecycle.

## Primary Checks
- **Schema Consistency**: Ensure `PlanVersion` models match the frontend form state.
- **Resolver Logic**: Validate that [[PricingResolver]] returns the expected price for edge-case countries.
- **UI Alignment**: Verify the Plan Builder displays the same currency and amount that will be charged.

## Tools
- `backend/scripts/validatePricingIntegrity.js`

## Status
**ACTIVE** — Key part of the v3 stabilization.

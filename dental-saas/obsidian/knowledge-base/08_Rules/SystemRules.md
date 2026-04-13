# System Rules

## Rule 1: Source of Truth
Documentation (this vault) is the absolute source of truth. Feature implementation must follow the specs defined here.

## Rule 2: No Ghost Features
No feature or architectural pattern is to be implemented without corresponding documentation in the knowledge base.

## Rule 3: Radical Linking
All modules, services, and models must be cross-linked. Orphan nodes in the graph view are considered "Architectural Technical Debt."

## Rule 4: Migration Safety
Any breaking change to core models or pricing logic requires a documented migration plan and a reconciliation script (e.g., [[EntitlementSystem]]).

## Rule 5: Determinism
All pricing and entitlement checks must be deterministic. Given the same input (Plan + Org Context), the system must always return the same result.

## Status
**ENFORCED**

# Authority Bridge

## Purpose
The central service that resolves user authority and permission sets by bridging the Platform and Organization planes.

## Input
- `JWT` (Decoded)
- `roleId` (from Org or Platform)

## Output
- `permissionSet` (Array of permission strings)
- `isAdmin` (Boolean)

## Logic
1. Identifies if the user is a Platform Admin or an Org User.
2. For Org Users, it fetches the role from the specific organization's database via [[DBConnectionManager]].
3. Merges static system permissions with dynamic role permissions.

## Dependencies
- [[AuthMiddleware]] — Provides the decoded token.
- [[SecurityArchitecture]] — Defines the permission matrix.

## Status
**ACTIVE** — Handles cross-plane authorization.

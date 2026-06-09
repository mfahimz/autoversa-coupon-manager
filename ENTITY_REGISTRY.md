---

# ENTITY_REGISTRY.md
# Source of truth for all entity fields in the Al Maraghi Coupon Manager.
# Update this file whenever fields are added, removed, or changed in Base44.

---

## User

| Field | Type | Description |
|---|---|---|
| user_role | string (enum) | App role. Allowed values: ADMIN, ADMIN_MANAGER, CRE, MARKETING, SERVICE_ADVISOR, BRANCH_MANAGER, REPORTING_ANALYST. Default: CRE |
| allowed_pages | array of strings | List of page names this user can access |
| assigned_branches | array of strings | List of branch names assigned to this user (for Marketing/Manager) |
| advisor_code | string | Personal code assigned to SERVICE_ADVISOR users. Embedded in coupon codes for tracking. Must be unique per user. |

---

## Offer

| Field | Type | Description |
|---|---|---|
| coupon_code_structure | string | Pattern used to generate coupon codes for this offer. Uses placeholders: {PREFIX}, {SERIAL}, {ADVISOR}, {IDENTIFIER} |
| customizable_variables | string | Legacy variable config field |
| offer_variables | string (JSON array) | Dynamic variables for this offer. Parse with JSON.parse() before use. Stringify with JSON.stringify() before saving. |
| vehicle_config | string (JSON object) | Vehicle configuration for this offer. Parse with JSON.parse() before use. Stringify with JSON.stringify() before saving. |

---

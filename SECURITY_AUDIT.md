# AutoVersa Security Audit

| Zone | Last Checked | Result |
|---|---|---|
| 1. Data Access & Permissions | 2026-06-23 | 3 problems found, 1 critical |
| 2. Business Rule Integrity | 2026-06-24 | 3 warnings, 2 informational |
| 3. Input Validation, Storage & Session Handling | Never | Not yet checked |

---

## Zone 1 — Data Access & Permissions

### Critical
- **Unscoped appointments query**:
  - **What's wrong**: The query fetches all appointment rows (including sensitive PII) without scoping to `booked_by` or verifying the user role.
  - **Why it matters**: Service advisors and other non-admin roles can read private customer details and vehicle info of other advisors.
  - **Where**: [src/app/appointments/page.tsx:L260-L265](file:///Users/fahim/autoversa-coupon-manager/src/app/appointments/page.tsx#L260-L265)

### Warning
- **Missing `checkPermission()` verification on users page**:
  - **What's wrong**: The page bypasses the custom RBAC system and relies on a hardcoded role check (`profile?.user_role !== 'ADMIN'`).
  - **Why it matters**: Prevents delegating user management permissions to other roles and makes UI-configured permissions misleading.
  - **Where**: [src/app/users/page.tsx:L154](file:///Users/fahim/autoversa-coupon-manager/src/app/users/page.tsx#L154)
- **Missing `checkPermission()` verification on dashboard page**:
  - **What's wrong**: The page renders role-specific components directly without verifying if the user has `page:dashboard` view permissions.
  - **Why it matters**: Users can access dashboard endpoints and views directly via URL even if dashboard access is disabled for their role.
  - **Where**: [src/app/dashboard/page.tsx:L213-L262](file:///Users/fahim/autoversa-coupon-manager/src/app/dashboard/page.tsx#L213-L262)

### Informational
- **Unscoped database queries in legacy/unused queries helper**:
  - **What's wrong**: Functions `getCoupons` and `getAppointments` query all records without filtering by user or role.
  - **Why it matters**: Any future developers using these helper functions directly could introduce unexpected data leaks.
  - **Where**: [src/lib/supabase/queries.ts:L63](file:///Users/fahim/autoversa-coupon-manager/src/lib/supabase/queries.ts#L63) and [src/lib/supabase/queries.ts:L90](file:///Users/fahim/autoversa-coupon-manager/src/lib/supabase/queries.ts#L90)
- **ADMIN role exclusion check**:
  - **Status**: Nothing to report. ADMIN is never excluded from permission checks; the global `checkPermission()` function explicitly returns true for `ADMIN`.
- **Client-side secrets check**:
  - **Status**: Nothing to report. No `service_role` keys or other secrets are exposed in client-side code; only public/anon environment keys are used.
- **Direct setting of role-sensitive fields check**:
  - **Status**: Nothing to report. Modifications to fields like `user_role`, `is_active`, and `advisor_code` are restricted to the users page, which is admin-gated at initialization.

## Zone 2 — Business Rule Integrity

### Critical
- **Status transitions check**:
  - **Status**: Nothing to report. No critical status transition issues found.
- **Expiry date checks check**:
  - **Status**: Nothing to report. No critical expiry date check issues found.
- **Layered rule enforcement check**:
  - **Status**: Nothing to report. No critical layered rule enforcement issues found.
- **Sequential numbering check**:
  - **Status**: Nothing to report. No critical sequential numbering issues found.

### Warning
- **Bypass of Coupon Expiry/Status Check on Redemption**:
  - **What's wrong**: Manual coupon redemption in `handleMarkRedeemed` directly updates the status to `REDEEMED` without re-querying the database to verify if the coupon is still active and has not expired.
  - **Why it matters**: Allows a user to redeem expired or already redeemed/cancelled coupons if a race condition occurs or if they construct a direct database update request.
  - **Where**: [src/app/coupons/page.tsx:L439](file:///Users/fahim/autoversa-coupon-manager/src/app/coupons/page.tsx#L439)
- **Blind Coupon Status Transition on Appointment Visited**:
  - **What's wrong**: Marking an appointment as `visited` blindly updates the associated referral coupon's status to `REDEEMED` without verifying that the coupon's current status is `ACTIVE`.
  - **Why it matters**: Can result in invalid status transitions, such as moving a `CANCELLED` or `EXPIRED` coupon to `REDEEMED`.
  - **Where**: [src/app/appointments/page.tsx:L675-L676](file:///Users/fahim/autoversa-coupon-manager/src/app/appointments/page.tsx#L675-L676)
- **UI-Only Enforcement of Offer Cap and Plate Uniqueness**:
  - **What's wrong**: Offer cap checks and plate uniqueness rules (`[PlateOfferCheck]` and `[MercedesPlateCheck]`) are enforced only in application/UI code, lacking corresponding database-level CHECK constraints or triggers.
  - **Why it matters**: Malicious clients or direct database connections can bypass these rules, creating duplicate coupons or exceeding offer caps.
  - **Where**: [src/app/create-coupon/page.tsx:L249-L281](file:///Users/fahim/autoversa-coupon-manager/src/app/create-coupon/page.tsx#L249-L281) (plate checks) and [src/app/appointments/page.tsx:L478-L492](file:///Users/fahim/autoversa-coupon-manager/src/app/appointments/page.tsx#L478-L492) (offer cap check)

### Informational
- **Missing API-Level Transition Verification for Appointments**:
  - **What's wrong**: The status update function `applyStatusUpdate` does not check if the requested transition is valid according to `getAvailableStatuses` on the server/DB side.
  - **Why it matters**: A client could bypass UI restrictions and update an appointment status to an invalid transition (e.g. going from `visited` back to `scheduled`).
  - **Where**: [src/app/appointments/page.tsx:L605-L663](file:///Users/fahim/autoversa-coupon-manager/src/app/appointments/page.tsx#L605-L663)
- **Sequential Number Generation check**:
  - **Status**: Nothing to report. Sequential coupon numbers are generated using the database RPC `increment_coupon_sequence`, and appointment numbers are generated database-side. Neither relies on stale client-side states.
  - **Where**: [src/app/create-coupon/page.tsx:L284](file:///Users/fahim/autoversa-coupon-manager/src/app/create-coupon/page.tsx#L284)

## Zone 3 — Input Validation, Storage & Session Handling
Not yet checked.

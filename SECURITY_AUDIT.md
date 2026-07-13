# AutoVersa Security Audit

| Zone | Last Checked | Result |
|---|---|---|
| 1. Data Access & Permissions | 2026-07-09 | 3 critical, 3 warnings |
| 2. Business Rule Integrity | 2026-07-10 | 3 warnings, 2 informational |
| 3. Input Validation, Storage & Session Handling | 2026-07-12 | No issues found |

---

## Zone 1 — Data Access & Permissions

### Critical
- **Unscoped appointments query**:
  - **What's wrong**: The query fetches all appointment rows (including sensitive PII) without scoping to the logged-in user or verifying their role.
  - **Why it matters**: Service advisors and other non-admin roles can read private customer details and vehicle info of other advisors.
  - **Where**: [src/app/appointments/page.tsx:L237](file:///Users/fahim/autoversa-coupon-manager/src/app/appointments/page.tsx#L237) and [src/app/appointments/page.tsx:L271-L276](file:///Users/fahim/autoversa-coupon-manager/src/app/appointments/page.tsx#L271-L276)
- **Unscoped customers query**:
  - **What's wrong**: The query fetches all company-wide customer records from `loyalty_customers` and `referral_customers` without applying any user or advisor filters.
  - **Why it matters**: Non-admin roles (e.g. advisors) can retrieve customer PII for accounts and vehicles not assigned to them.
  - **Where**: [src/app/customers/page.tsx:L122-L123](file:///Users/fahim/autoversa-coupon-manager/src/app/customers/page.tsx#L122-L123)
- **Unscoped dashboard coupons query**:
  - **What's wrong**: The page executes a query to fetch the 8 most recent coupons globally on page initialization, regardless of the logged-in user's role or scope.
  - **Why it matters**: Service advisors or receptionists can read recent coupon data including customer names and coupon codes.
  - **Where**: [src/app/dashboard/page.tsx:L342-L344](file:///Users/fahim/autoversa-coupon-manager/src/app/dashboard/page.tsx#L342-L344)

### Warning
- **Missing `checkPermission()` verification on users page**:
  - **What's wrong**: The page bypasses the custom RBAC system and relies on a hardcoded role check (`profile?.user_role !== 'ADMIN'`).
  - **Why it matters**: Prevents delegating user management permissions to other roles and makes UI-configured permissions misleading.
  - **Where**: [src/app/users/page.tsx:L166](file:///Users/fahim/autoversa-coupon-manager/src/app/users/page.tsx#L166)
- **Missing `checkPermission()` verification on dashboard page**:
  - **What's wrong**: The page renders role-specific components directly without verifying if the user has `page:dashboard` view permissions.
  - **Why it matters**: Users can access dashboard endpoints and views directly via URL even if dashboard access is disabled for their role.
  - **Where**: [src/app/dashboard/page.tsx:L238-L415](file:///Users/fahim/autoversa-coupon-manager/src/app/dashboard/page.tsx#L238-L415)
- **Missing action-specific permission checks on users page**:
  - **What's wrong**: User management mutations are executed without verifying user-specific action permissions (`action:permission:update`, `action:user:update_role`, `action:user:update_advisor_code`, `action:user:toggle_active`).
  - **Why it matters**: Granular permissions defined in the RBAC registry are not enforced when actions are performed.
  - **Where**: [src/app/users/page.tsx:L204](file:///Users/fahim/autoversa-coupon-manager/src/app/users/page.tsx#L204), [src/app/users/page.tsx:L247](file:///Users/fahim/autoversa-coupon-manager/src/app/users/page.tsx#L247), [src/app/users/page.tsx:L267](file:///Users/fahim/autoversa-coupon-manager/src/app/users/page.tsx#L267), and [src/app/users/page.tsx:L283](file:///Users/fahim/autoversa-coupon-manager/src/app/users/page.tsx#L283)

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
  - **Where**: [src/app/coupons/page.tsx:L476](file:///Users/fahim/autoversa-coupon-manager/src/app/coupons/page.tsx#L476)
- **Blind Coupon Status Transition on Cancellation**:
  - **What's wrong**: Coupon cancellation directly updates the status to `CANCELLED` without verifying if the coupon was `ACTIVE` in the database.
  - **Why it matters**: Allows a user to transition a `REDEEMED` or `EXPIRED` coupon to `CANCELLED`, violating the allowed status transitions.
  - **Where**: [src/app/coupons/page.tsx:L1155](file:///Users/fahim/autoversa-coupon-manager/src/app/coupons/page.tsx#L1155)
- **UI-Only Enforcement of Offer Cap and Plate Uniqueness**:
  - **What's wrong**: Offer cap checks and plate uniqueness rules (`[PlateOfferCheck]` and `[MercedesPlateCheck]`) are enforced only in application/UI code, lacking corresponding database-level CHECK constraints, unique constraints, or triggers.
  - **Why it matters**: Malicious clients or direct database connections can bypass these rules, creating duplicate coupons or exceeding offer caps.
  - **Where**: [src/app/create-coupon/page.tsx:L296-L328](file:///Users/fahim/autoversa-coupon-manager/src/app/create-coupon/page.tsx#L296-L328) (plate checks) and [src/app/appointments/page.tsx:L491-L507](file:///Users/fahim/autoversa-coupon-manager/src/app/appointments/page.tsx#L491-L507) (offer cap check)

### Informational
- **Missing API-Level Transition Verification for Appointments**:
  - **What's wrong**: The status update function `applyStatusUpdate` does not check if the requested transition is valid according to `getAvailableStatuses` on the server/DB side.
  - **Why it matters**: A client could bypass UI restrictions and update an appointment status to an invalid transition (e.g. going from `visited` back to `scheduled`).
  - **Where**: [src/app/appointments/page.tsx:L620-L685](file:///Users/fahim/autoversa-coupon-manager/src/app/appointments/page.tsx#L620-L685)
- **Sequential Number Generation check**:
  - **Status**: Nothing to report. Sequential coupon numbers are generated using the database RPC `increment_coupon_sequence` and appointment numbers are generated database-side.
  - **Where**: [src/app/create-coupon/page.tsx:L331](file:///Users/fahim/autoversa-coupon-manager/src/app/create-coupon/page.tsx#L331)

## Zone 3 — Input Validation, Storage & Session Handling

### Critical
- **Missing `is_active` status verification and sign-out redirect check**:
  - **Status**: Nothing to report. All user-facing protected pages now properly perform the active-user validation check and sign out/redirect deactivated users.

### Warning
- **Raw Supabase query error messages check**:
  - **Status**: Nothing to report. Raw database query error messages are no longer displayed to users; generic error handling has been implemented.

### Informational
- **Free-text input sanitization check**:
  - **Status**: Nothing to report. User inputs are fully sanitized, and dashboard filter inputs have been updated to escape HTML brackets.
- **No placeholder-style strings in JSX display text check**:
  - **Status**: Nothing to report. No `{PLACEHOLDER}` style strings exist in JSX display text.
- **Storage bucket file uploads authentication gating check**:
  - **Status**: Nothing to report. Storage bucket uploads are strictly confined to authenticated-gated offer-creation and editing code paths.

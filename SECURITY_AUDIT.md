# AutoVersa Security Audit

| Zone | Last Checked | Result |
|---|---|---|
| 1. Data Access & Permissions | 2026-07-09 | 3 critical, 3 warnings |
| 2. Business Rule Integrity | 2026-06-24 | 3 warnings, 2 informational |
| 3. Input Validation, Storage & Session Handling | 2026-07-06 | 1 critical, 2 warnings, 1 informational |

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

### Critical
- **Missing `is_active` status verification and sign-out redirect on Dashboard**:
  - **What's wrong**: The dashboard page fetches the user's role profile but omits the `is_active` check and the redirect/sign-out logic.
  - **Why it matters**: A user whose account has been deactivated (is_active = false) can still access the dashboard views and read metrics, advisor details, and pipelines.
  - **Where**: [src/app/dashboard/page.tsx:L222-L285](file:///Users/fahim/autoversa-coupon-manager/src/app/dashboard/page.tsx#L222-L285)

### Warning
- **Raw Supabase query error messages leaked on booking appointment**:
  - **What's wrong**: The raw `error.message` from the Supabase insert response is appended directly to the user-facing error toast.
  - **Why it matters**: Exposes internal database details, column names, or schema info to clients if a database constraint/operation fails.
  - **Where**: [src/app/appointments/page.tsx:L550](file:///Users/fahim/autoversa-coupon-manager/src/app/appointments/page.tsx#L550)
- **Raw Supabase query error messages leaked on saving customer profile updates**:
  - **What's wrong**: The raw `error.message` from the Supabase update response is appended directly to the user-facing error toast.
  - **Why it matters**: Exposes database schema and internal error states directly to front-end users.
  - **Where**: [src/app/customers/page.tsx:L189](file:///Users/fahim/autoversa-coupon-manager/src/app/customers/page.tsx#L189)

### Informational
- **Unsanitized dashboard search inputs**:
  - **What's wrong**: The dashboard search inputs for filters (`rSearch`, `advisorSearch`, `adminPipelineSearch`) do not apply the existing sanitization pattern (`.replace(/[<>]/g, '')`).
  - **Why it matters**: Potential for client-side text injection or formatting issues, though currently limited to client-side filtering variables.
  - **Where**: [src/app/dashboard/page.tsx:L1035](file:///Users/fahim/autoversa-coupon-manager/src/app/dashboard/page.tsx#L1035), [src/app/dashboard/page.tsx:L1130](file:///Users/fahim/autoversa-coupon-manager/src/app/dashboard/page.tsx#L1130), and [src/app/dashboard/page.tsx:L1347](file:///Users/fahim/autoversa-coupon-manager/src/app/dashboard/page.tsx#L1347)
- **No placeholder-style strings in JSX display text check**:
  - **Status**: Nothing to report. No `{PLACEHOLDER}` style strings exist in JSX display text.
- **Storage bucket file uploads authentication gating check**:
  - **Status**: Nothing to report. Storage bucket file uploads only occur in `OfferForm.tsx` via `saveOneTemplate`, which is embedded only in `NewOfferPage` and `EditOfferPage`. Both parent pages are protected by active-user authentication and role permission checks before rendering.

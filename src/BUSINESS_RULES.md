# Business Rules — Al Maraghi Coupon Manager
# Last updated: 2026-05-23
# Maintained by: Al Maraghi Dev Team
#
# Every business rule governing the logic of this system. Written in plain English. No code.
# Every agent prompt implementing business logic must read this file and confirm compliance.
# Update this file before changing any rule — not after.

---

## How to Use This File

Every rule has a short name in brackets. Reference rules by name in prompts.
If a rule conflicts with a requested implementation, stop and flag the conflict.
Never implement logic that violates a rule without explicit written approval.

---

## Dashboard Rules

**[SingleDashboard]:** There is only one Dashboard page in the application. It renders different content, widgets, and statistics depending on the logged-in user's role. Never create separate dashboard pages per role.

**[DashboardRoles]:** The Dashboard supports four role views: ADMIN, SERVICE_ADVISOR, CEO, and MANAGER. ADMIN_MANAGER sees the ADMIN view. MARKETING sees a limited view showing only coupon creation stats.

---

## Coupon Creation Rules

**[AdvisorCodeRequired]:** Every coupon created by a SERVICE_ADVISOR must have that advisor's personal code (advisor_code from the User entity) embedded in the coupon_code at creation time. A coupon cannot be created by a SERVICE_ADVISOR without an advisor_code assigned to their user account.

**[CouponCodeStructure]:** The coupon code format is defined per Offer via the coupon_code_structure field. The structure is variable and set by admins. The advisor_code is always appended or embedded according to the defined structure.

**[CodePrefix]:** When a Template is used, the template's coupon_code_prefix is prepended to the coupon code before the offer structure and advisor code segments.

**[CouponCodeReadOnly]:** Once a coupon code is generated and saved, it must never be modified by any process, function, or user action.

**[ExpiryCalculation]:** The expiry_date of a coupon is always calculated as issue_date plus valid_days. The valid_days value is taken from the Offer entity unless explicitly overridden at creation time.

**[IssueDateReadOnly]:** The issue_date is set at the moment of coupon creation and must never be modified after that point.

**[NoBulkCreate]:** The Bulk Create Coupons feature has been removed. All coupon creation is done one coupon at a time through the Create Coupon page.

**[PlateOfferCheck]:** A coupon cannot be created for a plate number if there is already an active, redeemed, or expired coupon (status is not CANCELLED) for the same plate number and the same offer.

**[MercedesPlateCheck]:** A Mercedes brand coupon cannot be created for a plate number if there is already an active, redeemed, or expired coupon (status is not CANCELLED) for that plate number where the offer brand is Mercedes-Benz. This restricts plate numbers to a single Mercedes loyalty coupon across all Mercedes offers.

---

## Coupon Status Rules

**[StatusValues]:** A coupon's status can only be one of four values: ACTIVE, REDEEMED, EXPIRED, or CANCELLED. No other values are valid.

**[StatusTransitions]:** An ACTIVE coupon can move to REDEEMED, EXPIRED, or CANCELLED. A REDEEMED, EXPIRED, or CANCELLED coupon cannot have its status changed back to ACTIVE under any circumstances without explicit admin action.

**[RedemptionLogging]:** Every status change on a coupon must create a corresponding CouponActivityLog record capturing the previous status, new status, user who made the change, and timestamp.

---

## Offer Rules

**[PerOfferVariables]:** Each Offer defines which template variables are customizable at coupon creation time via the customizable_variables field. Only variables listed in this field may be overridden when creating a coupon for that offer.

**[PerOfferCodeStructure]:** Each Offer defines its own coupon code structure via the coupon_code_structure field. Admins set this per offer. The structure must always include a slot for the advisor_code.

**[OfferCustomerStatus]:** An offer is targeted at either NEW or EXISTING customers, never both. This is set on the Offer entity and must be respected when creating coupons.

---

## Service Advisor Rules

**[AdvisorCodeUnique]:** Each SERVICE_ADVISOR user must have a unique advisor_code. No two advisors may share the same code.

**[AdvisorCodeAssignment]:** The advisor_code is assigned to a SERVICE_ADVISOR by an ADMIN or ADMIN_MANAGER. A SERVICE_ADVISOR cannot assign their own code.

**[AdvisorTracking]:** The advisor_code embedded in a coupon code is the primary mechanism for tracking how many coupons each advisor issued and how many were redeemed. Reports must be filterable by advisor_code.

---

## Access Control Rules

**[RoleBasedNav]:** Navigation items shown to a user are determined by their role and their UserPageAccess records. A user sees only pages their role has default access to, plus any additional pages granted via UserPageAccess.

**[NoIntegrationsPage]:** The Integrations page has been removed from the application. No navigation item or route for it should exist.

**[NoBulkCreatePage]:** The Bulk Create Coupons page has been removed from the application. No navigation item or route for it should exist.

---

## Reporting Rules

**[AdvisorReporting]:** Reports must support filtering by advisor_code to show how many coupons a specific advisor issued and how many of those were redeemed or resulted in a customer visit.

**[ReportingRoles]:** The reporting dashboard is accessible to ADMIN, ADMIN_MANAGER, CEO, and MANAGER roles. SERVICE_ADVISOR and MARKETING roles do not have access to the full reporting dashboard.

---

## Template Rules

**[TemplateVariablePositions]:** Variable positions (coordinates, font, color) for a template are stored in TemplateVariablePosition records linked to the template. These are set by admins and used by the generateCouponImage function.

**[DefaultTemplate]:** Each offer may have one default template (is_default === true). If a user does not select a template at coupon creation, the default template for the selected offer is used automatically.

---

## WhatsApp Rules

**[WhatsAppOptional]:** Sending a coupon via WhatsApp is optional. A coupon can exist and be valid without being sent via WhatsApp.

**[SharedTracking]:** When a coupon is sent via WhatsApp, both shared_by_user_id and shared_at must be written together in the same operation.

---

## Rules Pending Approval

| Rule name | Description | Proposed by | Date proposed | Status |
|---|---|---|---|---|
| — | — | — | — | — |

---

## Change Log

| Date | Rule | Change | Changed by |
|---|---|---|---|
| 2026-05-23 | All | Initial rules defined from app overview and change notes | Claude / Al Maraghi team |
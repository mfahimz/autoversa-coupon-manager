# Architecture — Al Maraghi Coupon Manager
# Last updated: 2026-05-23
# Maintained by: Al Maraghi Dev Team
#
# High-level map of the system. Updated as the system grows.

---

## System Overview

**Name:** Al Maraghi Coupon Manager
**Platform:** Base44 (React frontend + Deno cloud functions)
**Purpose:** Digital coupon management system for Al Maraghi Auto Repairs. Allows authorized staff to create, distribute, and verify digital coupons for car services. Supports role-based access and tracks coupon issuance per Service Advisor for reporting.
**Users:** Admin, Admin Manager, Marketing, Service Advisor, CEO, Manager
**Deployment:** Base44 hosted, GitHub-connected repository

---

## Entity Map

```
Offer
  ├── has many → Coupon (via coupon.offer_id)
  └── has many → Template (via template.offer_id)

Template
  ├── belongs to → Offer (via template.offer_id)
  └── has many → TemplateVariablePosition (via template_variable_position.template_id)

TemplateVariablePosition
  └── belongs to → Template

Coupon
  ├── belongs to → Offer (via coupon.offer_id)
  ├── belongs to → Template (via coupon.template_id)
  ├── belongs to → User/creator (via coupon.created_by_user_id)
  ├── belongs to → User/sharer (via coupon.shared_by_user_id)
  ├── belongs to → Branch (via coupon.branch_id)
  └── has many → CouponActivityLog (via coupon_activity_log.coupon_id)

CouponActivityLog
  ├── belongs to → Coupon
  └── belongs to → User (via coupon_activity_log.performed_by_user_id)

User
  ├── belongs to → Branch (via user.branch_id)
  ├── has many → UserPageAccess (via user_page_access.user_id)
  └── has many → Coupon created (via coupon.created_by_user_id)

Page
  └── has many → UserPageAccess (via user_page_access.page_id)

UserPageAccess
  ├── belongs to → User
  └── belongs to → Page

Branch
  ├── has many → User (via user.branch_id)
  └── has many → Coupon (via coupon.branch_id)

IntegrationSettings
  └── standalone — no relations
```

---

## Cloud Functions Map

| Function file | Purpose | Called by | Entities touched |
|---|---|---|---|
| generateCouponImage.js | Generates the visual coupon PNG by overlaying dynamic data onto a template image | CreateCoupon page | Coupon, Template, TemplateVariablePosition |
| sendWhatsAppCoupon.js | Sends a generated coupon image to a customer via WhatsApp | CreateCoupon page, CouponDetail | Coupon (writes shared_by_user_id, shared_at) |
| initializeUserAccess.js | Sets up default page access for a new user based on their role | Called on first login | UserPageAccess, Page, User |
| updateUserRole.js | Admin function to change a user's role | AdminUsers page | User |

---

## Frontend Pages Map

| Page file | Route | Purpose | Roles with access |
|---|---|---|---|
| Dashboard.jsx | /dashboard | Single dynamic dashboard — content varies by role | ALL roles |
| CreateCoupon.jsx | /create-coupon | Create a single coupon for a customer | ADMIN, ADMIN_MANAGER, MARKETING, SERVICE_ADVISOR |
| VerifyCoupon.jsx | /verify-coupon | Search and validate coupons by plate, mobile, or code | SERVICE_ADVISOR, ADMIN, ADMIN_MANAGER |
| AdminOffers.jsx | /admin/offers | Create and manage offers including code structure and variables | ADMIN, ADMIN_MANAGER |
| AdminTemplates.jsx | /admin/templates | Manage coupon templates and variable positions | ADMIN, ADMIN_MANAGER |
| AdminUsers.jsx | /admin/users | Manage users, roles, advisor codes, and page access | ADMIN, ADMIN_MANAGER |
| ReportingDashboard.jsx | /reports | Coupon usage reports filterable by advisor | ADMIN, ADMIN_MANAGER, CEO, MANAGER |

**Removed pages (do not recreate):**
- BulkCreateCoupons — removed per change request
- Integrations — removed per change request

---

## Data Flow — Key Processes

### Coupon Creation (Service Advisor flow)

```
Step 1: Service Advisor opens CreateCoupon page
Step 2: Advisor selects an Offer
Step 3: System loads the Offer's customizable_variables and coupon_code_structure
Step 4: Advisor fills in customer details (plate or mobile) and any customizable variables
Step 5: System generates coupon_code using: template prefix + offer code structure + advisor_code
Step 6: CreateCoupon page calls generateCouponImage cloud function
Step 7: generateCouponImage reads Template + TemplateVariablePosition records
Step 8: generateCouponImage overlays dynamic data onto template image and saves PNG
Step 9: Coupon record is created with status ACTIVE, image_file_path, advisor_code, created_by_user_id
Step 10: CouponActivityLog record is created with action CREATED
Step 11: Optionally: sendWhatsAppCoupon is called to send the coupon image to the customer
```

### Coupon Verification (Service Advisor flow)

```
Step 1: Service Advisor opens VerifyCoupon page
Step 2: Advisor searches by plate number, mobile number, or coupon code
Step 3: System returns matching Coupon records with their current status
Step 4: Advisor marks coupon as REDEEMED
Step 5: Coupon status updated to REDEEMED
Step 6: CouponActivityLog record created with action REDEEMED
```

### Dashboard Rendering (role-based)

```
Step 1: User logs in — role is read from base44.auth.me()
Step 2: Dashboard page checks user.role
Step 3: ADMIN / ADMIN_MANAGER → full stats: total coupons, active, redeemed, by advisor, by offer, by branch
Step 4: SERVICE_ADVISOR → personal stats: coupons I created, redeemed, pending
Step 5: CEO / MANAGER → high-level stats: total issued, redemption rate, by branch
Step 6: MARKETING → creation stats only: coupons created by offer
```

---

## External Integrations

| Service | Purpose | Cloud function | Authentication method |
|---|---|---|---|
| WhatsApp | Send coupon images to customers | sendWhatsAppCoupon.js | API key via Base44 IntegrationSettings |

---

## File Structure

```
/
├── AI_RULES.md                     Agent rules — read first always
├── ENTITY_REGISTRY.md              All entity fields
├── BUSINESS_RULES.md               All business rules
├── PROMPT_LOG.md                   History of agent prompts
├── ARCHITECTURE.md                 This file
├── KNOWN_ISSUES.md                 Known bugs and workarounds
│
├── src/
│   ├── pages/                      React page components
│   │   ├── Dashboard.jsx           Single dynamic dashboard (role-aware)
│   │   ├── CreateCoupon.jsx        Single coupon creation
│   │   ├── VerifyCoupon.jsx        Coupon verification
│   │   ├── AdminOffers.jsx         Offer management
│   │   ├── AdminTemplates.jsx      Template management
│   │   ├── AdminUsers.jsx          User and access management
│   │   └── ReportingDashboard.jsx  Reports
│   │
│   ├── components/                 Reusable React components
│   │
│   └── api/                        Base44 SDK client
│
├── functions/                      Deno cloud functions
│   ├── generateCouponImage.js
│   ├── sendWhatsAppCoupon.js
│   ├── initializeUserAccess.js
│   └── updateUserRole.js
│
├── package.json
├── vite.config.js
└── index.html
```

---

## Key Constants

| Constant | Value | Defined in | Used in | What it controls |
|---|---|---|---|---|
| BATCH_SIZE | 10 | AI_RULES.md | all bulk functions | Records per processing batch |
| BATCH_DELAY_MS | 300 | AI_RULES.md | all bulk functions | Delay between batches (ms) |
| STATUS_ACTIVE | ACTIVE | Coupon entity | all coupon logic | Valid coupon status value |
| STATUS_REDEEMED | REDEEMED | Coupon entity | all coupon logic | Redeemed coupon status value |
| STATUS_EXPIRED | EXPIRED | Coupon entity | all coupon logic | Expired coupon status value |
| STATUS_CANCELLED | CANCELLED | Coupon entity | all coupon logic | Cancelled coupon status value |

---

## Decisions Log

| Date | Decision | Reason | Alternative considered |
|---|---|---|---|
| 2026-05-23 | Single dynamic dashboard instead of per-role dashboard pages | Simpler routing, easier to maintain one file | Separate page per role |
| 2026-05-23 | Remove Bulk Create Coupons page | No longer needed per business requirement | Keep with restricted access |
| 2026-05-23 | Remove Integrations page | No longer needed per business requirement | Keep with admin-only access |
| 2026-05-23 | Embed advisor_code in coupon_code | Enables reporting without joins; code carries its own tracking data | Store only as a separate field |
| 2026-05-23 | Per-offer coupon code structure | Different offers need different code formats | Global single code format |
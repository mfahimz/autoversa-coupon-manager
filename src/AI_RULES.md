# AI Rules — Al Maraghi Coupon Manager
# Last updated: 2026-06-03
# Version: 1.1
#
# READ THIS FILE COMPLETELY BEFORE DOING ANYTHING ELSE IN THIS REPOSITORY.
# Every agent. Every prompt. Every task. No exceptions.

---

## Project Identity

This is Al Maraghi Coupon Manager, a digital coupon management system for Al Maraghi Auto Repairs.
Built on Base44 with React frontend and Deno backend functions.

Primary code agent: Antigravity
Deep debugging fallback: Cursor (only after 2 failed Antigravity attempts)
Entity and schema changes: Base44 AI (build mode only)

Main branch: main (treated as production at all times)

---

## Mandatory Agent Behavior — Non-Negotiable

These apply to every task, large or small, without exception:

1. Read this file first before any other action.
2. Only touch files that are explicitly named in the prompt.
3. Add clear descriptive comments to every code block you write or modify.
4. Do not push or commit anything until explicitly told to do so with the words: SAFE TO PUSH
5. Provide a summary report at the end listing every file modified and every change made.
6. Do not add any logic, UI elements, validation, or helper functions not explicitly requested in the prompt.
7. If anything is unclear, state what is unclear and stop. Do not guess.
8. Do not refactor, rename, or restructure code that is outside the scope of the task.
9. Reference exact line numbers when modifying existing code.

---

## File Boundaries

The following files must never be touched without explicit permission named in the prompt:

- AI_RULES.md (this file — never modify)
- ENTITY_REGISTRY.md (read freely, never modify through code)
- BUSINESS_RULES.md (read freely, never modify through code)
- PROMPT_LOG.md (human maintains this manually — never modify through code)
- ARCHITECTURE.md (read freely, never modify through code)
- KNOWN_ISSUES.md (read freely, never modify through code)

---

## Naming Conventions

All names below are mandatory. Never use alternatives.

- React component files: PascalCase with .jsx extension — e.g., CreateCoupon.jsx, AdminOffers.jsx
- Deno cloud function files: camelCase with .js extension — e.g., generateCouponImage.js
- Entity field names: always snake_case — e.g., coupon_code, offer_id, plate_number
- Status field values: always SCREAMING_SNAKE_CASE — e.g., ACTIVE, REDEEMED, EXPIRED, CANCELLED
- Role values: always SCREAMING_SNAKE_CASE — e.g., ADMIN, ADMIN_MANAGER, MARKETING, SERVICE_ADVISOR
- Identifier type values: PLATE or MOBILE (uppercase only)
- Customer status values: NEW or EXISTING (uppercase only)

---

## Entity Field Rules

Before writing any function that reads or writes an entity field:
1. Check ENTITY_REGISTRY.md to confirm the field exists
2. If the field is not in the registry, stop and flag: BASE44 ENTITY NEEDED
3. Never invent field names — use only names confirmed in ENTITY_REGISTRY.md

### Read-only fields — NEVER write to these from calculated logic

- coupon_code on Coupon — set at creation time, never modified after generation
- issue_date on Coupon — set at creation time, never modified
- identifier_type on Coupon — set at creation time, never modified
- created_date on any entity — auto-set by Base44, never written manually

### Paired write fields — ALWAYS write these together

- status + shared_at on Coupon — when marking a coupon as shared, always write both
- expiry_date + valid_days on Coupon — always derive and write both together at creation

---

## Coupon Code Structure Rules

- Coupon codes follow the pattern defined on the Offer entity: coupon_code_structure
- The Service Advisor's personal code (advisor_code on User) is always embedded in the coupon code at creation
- The Template's coupon_code_prefix is prepended before the offer structure when a template is used
- Never generate a coupon code without embedding the advisor_code of the creating user

---

## Boolean Field Checks

When checking a boolean entity field, always use strict equality:

  CORRECT: if (entity.field_name === true)
  CORRECT: if (entity.field_name === false)
  WRONG:   if (entity.field_name)
  WRONG:   if (!entity.field_name)

---

## JSX Placeholder Strings

When writing JSX helper text or labels that contain placeholder examples like {PREFIX}, {SERIAL}, {ADVISOR}, {IDENTIFIER} — never write them as bare curly brace expressions. React will interpret them as JavaScript variables and throw a runtime error.

  CORRECT: {"{PREFIX}"}
  CORRECT: {"{SERIAL}"}
  WRONG:   {PREFIX}
  WRONG:   {SERIAL}

Always wrap placeholder strings as string literals inside curly braces.

---

## Tailwind Dynamic Classes

Never construct Tailwind class names dynamically using template literals or string concatenation.

  CORRECT: className="bg-red-500"
  CORRECT: className="bg-green-500"
  WRONG:   className={`bg-${color}-500`}
  WRONG:   className={"bg-" + variant + "-500"}

Tailwind requires full literal class strings to be present at build time. Dynamic construction produces classes that are never included in the compiled stylesheet.

---

## Zero-Value Override Checks

When checking for an override value that can legitimately be zero, use !== undefined.

  CORRECT: if (overrideValue !== undefined)
  WRONG:   if (overrideValue > 0)
  WRONG:   if (overrideValue)

---

## Timestamp Format

All date fields use ISO 8601 format: YYYY-MM-DD
All datetime fields use ISO 8601 format: YYYY-MM-DDTHH:MM:SSZ
A format mismatch does not throw an error — it produces null values silently.

---

## Role-Based Access Rules

- Dashboard page renders different content based on user.role — do not create separate dashboard pages per role
- Navigation items are filtered dynamically based on user.role and UserPageAccess records
- Never hardcode role checks outside of the Layout component and the Dashboard page unless explicitly instructed

---

## Cloud Function Limits

Deno cloud functions have a 60-second execution time limit.
Any function that may exceed 30 seconds must use batching.
BATCH_SIZE: 10 records per batch
BATCH_DELAY_MS: 300 milliseconds between batches
Any function calling external APIs must include retry logic.

---

## Never Do These

- Never push or commit without the exact phrase SAFE TO PUSH from the human
- Never ask Base44 AI to create a new page file (it overwrites existing implementations)
- Never modify a read-only field listed above
- Never write paired fields individually — always write them together
- Never use loose truthiness on boolean entity fields
- Never use > 0 to check for overrides that can be zero
- Never invent entity field names — only use fields confirmed in ENTITY_REGISTRY.md
- Never add logic not explicitly requested in the current prompt
- Never touch a file not explicitly named in the current prompt
- Never generate a coupon code without the advisor_code embedded

---

## End of AI Rules File

If you have read this file completely, state at the start of your response:
"AI rules file read. Proceeding with task."
Then proceed with the task described in the prompt.
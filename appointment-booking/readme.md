# Appointment Booking System — Technical Documentation

**Project:** WorldFirst Global — EEA & UK Telesales Appointment Booking  
**Portal:** WorldFirst Global (`49065391`)  
**Platform:** HubSpot Legacy App + Serverless Functions  
**Last Updated:** May 2026

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Pipeline Stages](#pipeline-stages)
4. [HubSpot Setup](#hubspot-setup)
5. [Workflows](#workflows)
6. [Serverless Functions](#serverless-functions)
7. [Booking Form Module](#booking-form-module)
8. [Reschedule Module](#reschedule-module)
9. [Cancel Module](#cancel-module)
10. [Email & ICS](#email--ics)
11. [User Journey](#user-journey)
12. [Known Issues & Fixes](#known-issues--fixes)
13. [Pending Items](#pending-items)

---

## Overview

A fully automated appointment booking system for WorldFirst EEA and UK telesales teams. Customers book appointments via a CMS form, get automatically assigned to a telesales rep via Round Robin, receive ICS calendar invites, and can reschedule or cancel via self-service links in the confirmation email.

### Key Features

- Round Robin owner assignment (native HubSpot workflow)
- Slot conflict detection (contact + owner level)
- ICS calendar invite emails (customer + owner)
- Self-service reschedule and cancel flows
- Separate EEA and UK pipelines
- Automatic ticket completion when appointment date passes

---

## Architecture

```
Booking Form (CMS Module)
    ↓ HubSpot Forms API
HubSpot Ticket (Queued)
    ↓ Telesales Assignment Workflow
Owner Assigned (Round Robin)
    ↓ Webhook
webhook-handler.js (Serverless)
    ↓
Conflict Check → Out of Slot (conflict) / Scheduled (no conflict)
    ↓ Scheduled
send_email Serverless → ICS Email to Customer + Owner
    ↓ Customer Action
Reschedule Module / Cancel Module
    ↓ HubSpot Forms API
webhook-handler.js
    ↓
Reschedule Allocating → Queue → New Owner → Repeat
Cancel → Cancelled
```

---

## Pipeline Stages

### EEA Pipeline

| Stage | ID |
|---|---|
| Queued | `1356908427` |
| Allocating | `1356908428` |
| Scheduled | `1356908429` |
| Out of Slot | `1356908430` |
| Cancelled | `1356908431` |
| Reschedule Allocating | `1356908433` |

### UK Pipeline

| Stage | ID |
|---|---|
| Queued | `1356915080` |
| Allocating | `1356915081` |
| Scheduled | `1356915082` |
| Out of Slot | `1356915083` |
| Cancelled | `1356906001` |
| Reschedule Allocating | `1356908064` |

---

## HubSpot Setup

### App Configuration

**Project:** `appointment-booking`  
**Platform Version:** `2026.03`  
**App UID:** `appointment_booking_app`  
**Distribution:** Private  
**Deployed at:** `https://campaign.worldfirst.com/hs/serverless/webhook-handler`

**Required Scopes:**
```json
[
  "oauth",
  "crm.objects.contacts.read",
  "crm.objects.contacts.write",
  "tickets",
  "crm.objects.owners.read",
  "transactional-email"
]
```

**Permitted URLs:**
```json
["https://api.hubapi.com", "https://campaign.worldfirst.com"]
```

### Webhook Subscriptions (`webhook-hsmeta.json`)

| Object | Property | Purpose |
|---|---|---|
| Ticket | `hubspot_owner_id` | Triggers allocation when owner assigned |
| Ticket | `slot_timing` | Triggers allocation on slot change |
| Ticket | `date_of_appointment` | Triggers allocation on date change |
| Contact | `request_reschedule_payload` | Triggers reschedule submission |
| Contact | `request_cancel_ticket_id` | Triggers cancel submission |

### Custom Ticket Properties

| Property | Type | Purpose |
|---|---|---|
| `region` | Dropdown | EEA or UK |
| `date_of_appointment` | Date | Appointment date |
| `slot_timing` | Dropdown | Time slot |

**slot_timing options:**
- `9.00 AM - 10.00 AM`
- `10.00 AM - 11.00 AM`
- `11.00 AM - 12.00 PM` ← Note: must be PM not AM

### Custom Contact Properties

| Property | Type | Purpose |
|---|---|---|
| `request_reschedule_payload` | Single line text | Reschedule form payload |
| `request_cancel_ticket_id` | Single line text | Cancel form ticket ID |

---

## Workflows

### 1. Pipeline — Telesales Assignment Automation

**Object:** Ticket  
**Type:** Native HubSpot — no custom code

```
Trigger: Ticket Stage = Queued
         AND Ticket Owner is unknown
         AND Region = EEA or UK
↓
2 min delay
↓
Random Distribution:
  Branch 1 (33%) → Set Owner = Rep 1
  Branch 2 (33%) → Set Owner = Rep 2
  Branch 3 (34%) → Set Owner = Rep 3
```

> **Note:** Owner IDs must be set to actual EEA/UK telesales rep HubSpot owner IDs.

---

### 2. Pipeline — Allocation Handling (Core Process)

**Object:** Ticket  
**Type:** Native HubSpot — triggers webhook

```
Trigger: Slot Timing is known
         OR Owner is known
         OR Date of Appointment is known
         AND Region = EEA or UK
↓
Sets ticket → Allocating (native action)
↓
Webhook fires → webhook-handler.js handles rest
```

---

### 3. Global — Set Appointment Pipeline Based on Region

**Object:** Appointment  
**Type:** Native HubSpot — no custom code

```
Trigger: Region is known
↓
Branch UK → Set Stage = Scheduled (UK Appointment Pipeline)
Branch EEA → Set Stage = Scheduled (EEA Appointment Pipeline)
```

---

### 4. Pipeline — Out of Slot → Send Reschedule Email

**Object:** Ticket  
**Type:** Native HubSpot email

```
Trigger: Stage = Out of Slot
↓
Send email to customer with reschedule link:
https://campaign.worldfirst.com/{region}-rescheduling-appointment
?title=...&date=...&time=...&id=...&ticket_id=...&email=...&region=...
```

---

### 5. Pipeline — Reschedule Allocating → Queue

**Object:** Ticket  
**Type:** Native HubSpot — no custom code

```
Trigger: Stage = Reschedule Allocating
↓
Clear hubspot_owner_id
↓
Set Stage = Queued
```

> This re-triggers the Telesales Assignment Automation workflow.

---

### 6. Pipeline — Appointment Complete

**Object:** Ticket  
**Type:** Native HubSpot — no custom code

```
Trigger: date_of_appointment is before today
         AND Stage = Scheduled
↓
Set Stage = Complete
```

---

## Serverless Functions

### webhook-handler.js

**URL:** `https://campaign.worldfirst.com/hs/serverless/webhook-handler`  
**Entrypoint:** `/app/functions/webhook-handler.js`  
**Secret Keys:** `PRIVATE_APP_ACCESS_TOKEN`

#### Constants

```javascript
const TIMEZONE_OFFSET = { EEA: 1, UK: 0 };
const SERVERLESS_URL  = "https://campaign.worldfirst.com/hs/serverless/send_email";
const FROM_EMAIL      = "no-reply@service.worldfirst.com";
```

#### Functions

| Function | Purpose |
|---|---|
| `fetchTicketProps()` | Fetches region, stage, owner from ticket |
| `isSkippableStage()` | Returns true for Allocating, Reschedule Allocating, Scheduled, Out of Slot, Cancelled |
| `fetchOwnerEmail()` | Fetches owner email from HubSpot Owners API |
| `formatDateForEmail()` | Converts ms or yyyy-mm-dd to dd/mm/yyyy |
| `normalize()` | Normalizes whitespace and special characters |
| `splitParts()` | Splits ticket subject by `#` |
| `handleRescheduleCheck()` | Checks contact property to determine if new or rescheduled |
| `handleSlotConflict()` | Checks contact + owner conflicts against Scheduled tickets |
| `handleConflict()` | Sets Out of Slot + Task + Note |
| `handleScheduled()` | Sets Scheduled + Note + sends ICS emails |
| `handleRescheduleSubmission()` | Updates ticket date/slot + sets Reschedule Allocating |
| `handleCancelSubmission()` | Sets ticket to Cancelled + creates note |
| `runAllocationFlow()` | Chains: reschedule check → conflict check → set Allocating → conflict or scheduled handler |

#### Trigger Flow

```
ticket.propertyChange → hubspot_owner_id → runAllocationFlow()
ticket.propertyChange → slot_timing (owner must exist) → runAllocationFlow()
ticket.propertyChange → date_of_appointment (owner must exist) → runAllocationFlow()
contact.propertyChange → request_reschedule_payload → handleRescheduleSubmission()
contact.propertyChange → request_cancel_ticket_id → handleCancelSubmission()
```

#### Conflict Detection

**Contact Conflict:** Same contact already has a Scheduled ticket with same date + slot + contactId  
**Owner Conflict:** Same owner already has a Scheduled ticket with same date + slot

Both use ticket `subject` field format: `date#slot#contactId`

#### `handleRescheduleCheck()` Logic

Fetches `request_reschedule_payload` from the **associated contact** (not the ticket):

```javascript
// payload format: ticketId#dateMs#timeText
if (payload && payload.startsWith(ticketId)) {
  isReschedule = true; // → successFlag = "Rescheduled"
} else {
  isReschedule = false; // → successFlag = "Scheduled"
}
```

This determines:
- Email text: "scheduled" vs "rescheduled"
- ICS `action`: `"new"` vs `"reschedule"` (updates existing calendar event)

---

### send_email.js

**URL:** `https://campaign.worldfirst.com/hs/serverless/send_email`  
**Project:** `send-email-smtp`  
**Cannot be modified.**

Accepts:

| Field | Description |
|---|---|
| `to` / `email` | Recipient email |
| `from_email` | Sender email |
| `fromName` | Sender display name |
| `title` | Appointment title |
| `appointment_id` | Ticket ID |
| `ticket_id` | Ticket ID |
| `date` | Formatted date (dd/mm/yyyy) |
| `time` | Slot timing string |
| `telesales` | Owner email |
| `location` | Meeting location |
| `action` | `"new"` or `"reschedule"` |
| `timezoneOffsetHours` | Region timezone offset |
| `html` | Optional custom HTML body |

Generates ICS attachment automatically. Sets `SEQUENCE:1` for `action = "reschedule"` so calendar apps update existing events.

---

## Booking Form Module

**File:** `booking-module.html` + `appointment_form_engine.js`  
**GraphQL:** `tickets_all` (fetches all EEA + UK pipeline tickets, no date filter)

### Module Fields

| Field | EEA Value | UK Value |
|---|---|---|
| `stages.scheduled` | `1356908429` | `1356915082` |
| `stages.queued` | `1356908427` | `1356915080` |
| `stages.allocating` | `1356908428` | `1356915081` |
| `stages.rescheduling` | `1356908433` | `1356908064` |
| `portal_id` | `49065391` | `49065391` |
| `form_guid` | EEA form GUID | UK form GUID |
| `slot_capacity` | `1` | `1` |

### Client-Side Checks

1. **Slot availability** — counts Scheduled tickets for selected date + slot vs capacity
2. **Duplicate check** — checks if same email already booked same date + slot
3. **Capacity check** — checks demand across all 4 stages (Queued + Allocating + Rescheduling + Scheduled)

### Form Submission Fields

```javascript
// Contact fields
{ objectTypeId: "0-1", name: "firstname", value: v.first }
{ objectTypeId: "0-1", name: "lastname",  value: v.last }
{ objectTypeId: "0-1", name: "email",     value: v.email }

// Ticket fields
{ objectTypeId: "0-5", name: "date_of_appointment", value: String(dateMs) }
{ objectTypeId: "0-5", name: "slot_timing",          value: v.slot }
{ objectTypeId: "0-5", name: "subject",              value: v.subject }
```

Ticket `subject` format: `date#slot#contactId` (used for conflict detection)

---

## Reschedule Module

**GraphQL:** Same `tickets_all` query as booking module  
**URL format:**
```
https://campaign.worldfirst.com/{region}-rescheduling-appointment
?title=...&date=...&time=...&id=...&ticket_id=...&email=...&region=...
```

### Module Fields

| Field | Value |
|---|---|
| `stages.scheduled` | Region-specific stage ID |
| `stages.queued` | Region-specific stage ID |
| `stages.allocating` | Region-specific stage ID |
| `stages.rescheduling` | Region-specific stage ID |
| `portal_id` | `49065391` |
| `reschedule_form_guid` | `43c7bce0-df8f-45e5-800a-d673735af944` |
| `slot_capacity` | `1` |

### Key Differences from Booking Module

- Region read from URL param (not module field)
- Duplicate check **excludes** the current ticket being rescheduled
- Date filtering done client-side using `normDateMs()` (handles both ms and yyyy-mm-dd)
- Submits: `email` + `request_reschedule_payload = ticketId#dateMs#timeText`

### Payload Format

```
request_reschedule_payload = "45284917826#1747872000000#9.00 AM - 10.00 AM"
                               ↑ ticketId    ↑ dateMs (UTC midnight)  ↑ timeText
```

---

## Cancel Module

**URL format:**
```
https://campaign.worldfirst.com/{region}-cancellation-appointment
?title=...&date=...&time=...&id=...&ticket_id=...&email=...&region=...
```

### Config

```javascript
const PORTAL_ID = "49065391";
const FORM_ID   = "145548f7-baf8-4149-9395-8efa68f36576";
```

### On Button Click

1. Generates ICS file with `METHOD:CANCEL` → downloads to customer device
2. Submits to HubSpot Forms API:
   - `email` = contact email
   - `request_cancel_ticket_id` = ticket ID
3. `handleCancelSubmission()` fires → sets ticket to Cancelled + creates note

### Timezone

Region-aware:
```javascript
const TIMEZONE_OFFSET = { EEA: 1, UK: 0 };
```

---

## Email & ICS

### Customer Email

Sent via `send_email` serverless when ticket moves to Scheduled.

**Contains:**
- Appointment details (ID, date, time, location)
- ICS calendar invite attachment
- Reschedule button (blue)
- Cancel button (red)

**HTML buttons:**
```html
<a href="{rescheduleUrl}" style="background:#3182ce;">Reschedule</a>
<a href="{cancelUrl}"     style="background:#e53e3e;">Cancel Appointment</a>
```

### Owner Email

Also sent via `send_email` serverless when ticket moves to Scheduled.

- Same ICS attachment
- No reschedule/cancel buttons
- `fromName`: "Internal Telesales Team"

### ICS Update on Reschedule

When `action = "reschedule"`:
- `send_email.js` sets `SEQUENCE:1` in ICS
- Calendar apps (Google, Outlook, Apple) update the existing event rather than creating a duplicate

---

## User Journey

```
1. Customer visits booking page
   → Selects date (Mon-Fri only)
   → Available slots load (full slots hidden)
   → Fills name, email, purpose
   → Clicks Submit

2. System validates
   → Duplicate check
   → Capacity check
   → Submits to HubSpot Forms API

3. HubSpot creates ticket → Queued
   → Region set (EEA or UK)
   → Subject: date#slot#contactId

4. Telesales Assignment Workflow
   → 2 min delay
   → Round Robin → assigns owner

5. webhook-handler.js fires
   → Reschedule check
   → Conflict check
   → Set Allocating

6a. CONFLICT → Out of Slot
    → Task created
    → Note created
    → Workflow sends reschedule email to customer
    → Customer reschedules → back to step 4

6b. NO CONFLICT → Scheduled
    → Note created
    → Customer ICS email sent (with Reschedule + Cancel buttons)
    → Owner ICS email sent

7. Appointment date passes
   → Workflow sets ticket → Complete

8. Customer reschedules (from email button)
   → Opens reschedule page
   → Checks availability
   → Submits new date + slot
   → Ticket → Reschedule Allocating
   → Workflow clears owner → Queued
   → Back to step 4

9. Customer cancels (from email button)
   → Opens cancel page
   → Clicks cancel
   → ICS cancel file downloaded
   → Ticket → Cancelled
```

---

## Known Issues & Fixes

### 1. slot_timing Property Typo (Fixed ✅)

**Problem:** HubSpot `slot_timing` dropdown had `"11.00 AM - 12.00 AM"` instead of `"11.00 AM - 12.00 PM"`

**Impact:**
- CRM API PATCH rejected slot_timing for 11AM slot
- Reschedule submissions stuck in Out of Slot
- slot_timing sometimes stored as empty

**Fix:** Updated HubSpot property dropdown option to `"11.00 AM - 12.00 PM"`

---

### 2. successFlag Always "Scheduled" (Fixed ✅)

**Problem:** `handleRescheduleCheck()` was fetching `request_reschedule_payload` from the ticket instead of the contact. Since it's a contact property, it always returned empty → `successFlag` always `"Scheduled"`.

**Impact:**
- Rescheduled appointment emails said "scheduled" instead of "rescheduled"
- ICS `action` was `"new"` instead of `"reschedule"`
- Calendar created duplicate events instead of updating existing ones

**Fix:** Now fetches from associated contact and checks `payload.startsWith(ticketId)`

---

### 3. Ticket Stuck in Allocating (Fixed ✅)

**Problem:** `ALLOCATING` and `RESCHEDULE_ALLOCATING` were not in `isSkippableStage()`. When slot_timing or date_of_appointment changed during allocation, it re-triggered allocation causing an infinite loop.

**Fix:** Added both stages to `isSkippableStage()`.

---

### 4. App Not Installed (Fixed ✅)

**Problem:** Webhooks were registered but app was not installed on the portal so events were never delivered.

**Fix:** Installed app on WorldFirst Global portal (`49065391`).

---

### 5. Missing transactional-email Scope (Fixed ✅)

**Problem:** `app-hsmeta.json` was missing `transactional-email` scope causing 403 errors.

**Fix:** Added `"transactional-email"` to `requiredScopes`.

---

## Pending Items

| Item | Notes |
|---|---|
| Update telesales rep owner IDs in workflow | Replace with actual EEA/UK rep HubSpot owner IDs |
| Update OWNER_NOTIFY_MAP if needed | Currently maps owner → owner directly |
| Create EEA booking page | Set module fields for EEA pipeline stages |
| Create UK booking page | Set module fields for UK pipeline stages |
| Test reschedule ICS update end-to-end | Verify calendar updates existing event |
| Test cancel flow end-to-end | Verify ticket moves to Cancelled |
| Handover to client | Walk through workflows + module field setup |

---

## Project Structure

```
appointment-booking/
├── hsproject.json                     (platformVersion: 2026.03)
└── src/app/
    ├── app-hsmeta.json               (static auth, scopes)
    ├── webhooks/
    │   └── webhook-hsmeta.json       (subscriptions config)
    └── functions/
        ├── webhook-handler.js        (all logic)
        ├── webhook-handler-hsmeta.json
        └── package.json              (axios dependency)

send-email-smtp/                       (separate project — do not modify)
├── hsproject.json                     (platformVersion: 2025.2)
└── src/app/
    └── functions/
        └── send_email.js             (SMTP + ICS generation)
```

---

## Deployment

```bash
# Upload appointment-booking project
cd appointment-booking
hs project upload

# After upload — reinstall app if scopes changed
# HubSpot → Developer Projects → appointment-booking
# → Distribution → Install
```

---
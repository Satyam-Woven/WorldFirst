const axios = require("axios");

// ── Constants ────────────────────────────────────────────────

const PIPELINE_STAGES = {
  EEA: {
    QUEUED:                "1356908427",
    ALLOCATING:            "1356908428",
    SCHEDULED:             "1356908429",
    OUT_OF_SLOT:           "1356908430",
    CANCELLED:             "1356908431",
    RESCHEDULE_ALLOCATING: "1356908433",
  },
  UK: {
    QUEUED:                "1356915080",
    ALLOCATING:            "1356915081",
    SCHEDULED:             "1356915082",
    OUT_OF_SLOT:           "1356915083",
    CANCELLED:             "1356906001",
    RESCHEDULE_ALLOCATING: "1356908064",
  },
};

const TIMEZONE_OFFSET = { EEA: 1, UK: 0 };

const SERVERLESS_URL       = "https://campaign.worldfirst.com/hs/serverless/send_email";
const FROM_EMAIL           = "no-reply@service.worldfirst.com";
const TICKET_DATE_PROPERTY = "date_of_appointment";
const TICKET_TIME_PROPERTY = "slot_timing";

// ── Helpers ──────────────────────────────────────────────────

async function fetchTicketProps(ticketId, headers) {
  const res = await axios.get(
    `https://api.hubapi.com/crm/v3/objects/tickets/${ticketId}?properties=region,hs_pipeline_stage,hubspot_owner_id`,
    { headers }
  );
  return res?.data?.properties || {};
}

function isSkippableStage(region, currentStage) {
  const skipStages = [
    PIPELINE_STAGES[region].ALLOCATING,
    PIPELINE_STAGES[region].RESCHEDULE_ALLOCATING,
    PIPELINE_STAGES[region].SCHEDULED,
    PIPELINE_STAGES[region].OUT_OF_SLOT,
    PIPELINE_STAGES[region].CANCELLED,
  ];
  return skipStages.includes(currentStage);
}

async function fetchOwnerEmail(ownerId, headers) {
  try {
    const res = await axios.get(
      `https://api.hubapi.com/crm/v3/owners/${ownerId}`,
      { headers }
    );
    return res?.data?.email || "";
  } catch (err) {
    console.error(`⚠️ Could not fetch owner email for ownerId: ${ownerId}`);
    return "";
  }
}

function formatDateForEmail(dateMs) {
  if (!dateMs) return "";
  const raw = String(dateMs).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const d = new Date(Number(raw));
  if (isNaN(d.getTime())) return raw;
  return `${d.getUTCDate().toString().padStart(2,"0")}/${(d.getUTCMonth()+1).toString().padStart(2,"0")}/${d.getUTCFullYear()}`;
}

const normalize = (s) =>
  String(s || "")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const splitParts = (subject) =>
  normalize(subject)
    .split("#")
    .map((p) => normalize(p));

// ── Reschedule Check ─────────────────────────────────────────

async function handleRescheduleCheck({ ticketId, region, headers }) {
  const stages = PIPELINE_STAGES[region];
  if (!stages) throw new Error(`Unsupported region: ${region}`);

  let isReschedule = false;

  try {
    const assocRes = await axios.get(
      `https://api.hubapi.com/crm/v3/objects/tickets/${ticketId}/associations/contacts`,
      { headers }
    );

    const contactId = assocRes?.data?.results?.[0]?.id || "";

    if (contactId) {
      const contactRes = await axios.get(
        `https://api.hubapi.com/crm/v3/objects/contacts/${contactId}?properties=request_reschedule_payload`,
        { headers }
      );

      const payload = String(
        contactRes?.data?.properties?.request_reschedule_payload || ""
      ).trim();

      if (payload && payload.startsWith(ticketId)) {
        isReschedule = true;
      }
    }
  } catch (err) {
    console.error(`⚠️ Reschedule check failed for ticketId: ${ticketId} — defaulting to Scheduled`, err.message);
    isReschedule = false;
  }

  const successFlag = isReschedule ? "Rescheduled" : "Scheduled";

  console.log(`✅ Reschedule Check — ticketId: ${ticketId} | isReschedule: ${isReschedule} | successFlag: ${successFlag}`);
  return { is_reschedule_stage: isReschedule, successFlag, region };
}

// ── Slot Conflict Check ──────────────────────────────────────

async function handleSlotConflict({ ticketId, region, headers }) {
  const stages = PIPELINE_STAGES[region];
  if (!stages) throw new Error(`Unsupported region: ${region}`);

  const ticketRes = await axios.get(
    `https://api.hubapi.com/crm/v3/objects/tickets/${ticketId}?properties=subject,hubspot_owner_id,region,hs_pipeline_stage`,
    { headers }
  );

  const props         = ticketRes?.data?.properties || {};
  const ticketSubject = String(props?.subject || "");
  const ownerId       = String(props?.hubspot_owner_id || "").trim();
  const parts         = splitParts(ticketSubject);

  if (parts.length < 3) {
    console.error(`⚠️ Invalid subject format for ticketId: ${ticketId} — subject: ${ticketSubject}`);
    return { is_conflicted: false, reason: "Invalid subject format.", ticket_id: ticketId };
  }

  const dateOfAppointment = parts[0];
  const slotTiming        = parts[1];
  const contactRecordId   = parts[2];
  const myKey3            = `${dateOfAppointment}#${slotTiming}#${contactRecordId}`;
  const myKey2            = `${dateOfAppointment}#${slotTiming}`;

  // ── 1) Contact Conflict ──────────────────────────────────
  const contactResp = await axios.post(
    "https://api.hubapi.com/crm/v3/objects/tickets/search",
    {
      filterGroups: [{
        filters: [
          { propertyName: "subject", operator: "CONTAINS_TOKEN", value: String(contactRecordId) },
          { propertyName: "hs_pipeline_stage", operator: "EQ", value: stages.SCHEDULED },
          { propertyName: "hs_object_id", operator: "NEQ", value: ticketId },
        ],
      }],
      properties: ["hs_object_id", "subject"],
      limit: 50,
    },
    { headers }
  );

  const contactConflictTickets = (contactResp?.data?.results || []).filter((t) => {
    const p = splitParts(String(t?.properties?.subject || ""));
    return p.length >= 3 && `${p[0]}#${p[1]}#${p[2]}` === myKey3;
  });

  const contactConflict = contactConflictTickets.length > 0;

  // ── 2) Owner Conflict ────────────────────────────────────
  let ownerConflictTickets = [];
  let ownerConflict        = false;

  if (ownerId) {
    const ownerResp = await axios.post(
      "https://api.hubapi.com/crm/v3/objects/tickets/search",
      {
        filterGroups: [{
          filters: [
            { propertyName: "hubspot_owner_id", operator: "EQ", value: ownerId },
            { propertyName: "hs_pipeline_stage", operator: "EQ", value: stages.SCHEDULED },
            { propertyName: "hs_object_id", operator: "NEQ", value: ticketId },
          ],
        }],
        properties: ["hs_object_id", "subject"],
        limit: 100,
      },
      { headers }
    );

    ownerConflictTickets = (ownerResp?.data?.results || []).filter((t) => {
      const p = splitParts(String(t?.properties?.subject || ""));
      return p.length >= 2 && `${p[0]}#${p[1]}` === myKey2;
    });

    ownerConflict = ownerConflictTickets.length > 0;
  }

  const isConflicted = contactConflict || ownerConflict;
  console.log(`✅ Slot Conflict — ticketId: ${ticketId} | isConflicted: ${isConflicted} | contact: ${contactConflict} | owner: ${ownerConflict}`);

  return {
    is_conflicted:          isConflicted,
    contact_conflict:       contactConflict,
    owner_conflict:         ownerConflict,
    slot_key:               myKey3,
    region_used:            region,
    contact_conflict_count: contactConflictTickets.length,
    owner_conflict_count:   ownerConflictTickets.length,
  };
}

// ── Conflict Handler ─────────────────────────────────────────

async function handleConflict({ ticketId, region, successFlag, conflictData, headers }) {
  const stages = PIPELINE_STAGES[region];
  if (!stages) throw new Error(`Unsupported region: ${region}`);

  const {
    is_conflicted,
    contact_conflict,
    owner_conflict,
    contact_conflict_count,
    owner_conflict_count,
  } = conflictData;

  if (!is_conflicted) return { success: true, reason: "No conflict detected." };

  // ── Contact Conflict ─────────────────────────────────────
  if (contact_conflict) {
    await axios.patch(
      `https://api.hubapi.com/crm/v3/objects/tickets/${ticketId}`,
      { properties: { hs_pipeline_stage: stages.OUT_OF_SLOT } },
      { headers }
    );

    await axios.post(
      "https://api.hubapi.com/crm/v3/objects/tasks",
      {
        properties: {
          hs_task_subject: `[Ticket ${successFlag} Conflicted] Schedule conflicted with another ticket`,
          hs_task_type:    "TODO",
          hs_timestamp:    Date.now(),
          hs_task_status:  "NOT_STARTED",
        },
        associations: [{ to: { id: ticketId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 26 }] }],
      },
      { headers }
    );

    await axios.post(
      "https://api.hubapi.com/crm/v3/objects/notes",
      {
        properties: {
          hs_note_body: [
            `[Conflict ${successFlag}] This customer has been scheduled for the same timing with the owner.`,
            `This ticket move to out of slot stage by the system because schedule assignment has been conflicted with another scheduled meeting in the same timing.`,
            ``,
            `Contact conflict count: ${contact_conflict_count} record`,
          ].join("\n"),
          hs_timestamp: Date.now(),
        },
        associations: [{ to: { id: ticketId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 18 }] }],
      },
      { headers }
    );

    console.log(`✅ Contact conflict handled for ticketId: ${ticketId}`);
    return { success: true, conflict_type: "contact", action_taken: "Out of Slot, Task & Note created" };
  }

  // ── Owner Conflict ───────────────────────────────────────
  if (owner_conflict) {
    await axios.patch(
      `https://api.hubapi.com/crm/v3/objects/tickets/${ticketId}`,
      { properties: { hs_pipeline_stage: stages.OUT_OF_SLOT } },
      { headers }
    );

    await axios.post(
      "https://api.hubapi.com/crm/v3/objects/tasks",
      {
        properties: {
          hs_task_subject: `[Ticket ${successFlag} Conflicted] Schedule conflicted with another ticket`,
          hs_task_type:    "TODO",
          hs_timestamp:    Date.now(),
          hs_task_status:  "NOT_STARTED",
        },
        associations: [{ to: { id: ticketId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 26 }] }],
      },
      { headers }
    );

    await axios.post(
      "https://api.hubapi.com/crm/v3/objects/notes",
      {
        properties: {
          hs_note_body: [
            `[Conflict ${successFlag}] The owner has been scheduled for the same timing with customer.`,
            `This ticket move to out of slot stage by the system because schedule assignment has been conflicted with another owner in the same timing.`,
            ``,
            `Owner conflict count: ${owner_conflict_count} record`,
          ].join("\n"),
          hs_timestamp: Date.now(),
        },
        associations: [{ to: { id: ticketId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 18 }] }],
      },
      { headers }
    );

    console.log(`✅ Owner conflict handled for ticketId: ${ticketId}`);
    return { success: true, conflict_type: "owner", action_taken: "Out of Slot, Task & Note created" };
  }

  return { success: true, reason: "is_conflicted was true but no specific conflict branch matched." };
}

// ── Scheduled Handler ────────────────────────────────────────

async function handleScheduled({ ticketId, region, successFlag, headers }) {
  const stages = PIPELINE_STAGES[region];
  if (!stages) throw new Error(`Unsupported region: ${region}`);

  const timezoneOffsetHours = TIMEZONE_OFFSET[region] ?? 0;

  const ticketRes = await axios.get(
    `https://api.hubapi.com/crm/v3/objects/tickets/${ticketId}?properties=subject,hubspot_owner_id,date_of_appointment,slot_timing,content,region,hs_pipeline_stage`,
    { headers }
  );

  const props             = ticketRes?.data?.properties || {};
  const ownerId           = String(props?.hubspot_owner_id || "").trim();
  const subject           = String(props?.subject || "").trim();
  const content           = String(props?.content || "").trim();
  const dateOfAppointment = String(props?.date_of_appointment || "").trim();
  const slotTiming        = String(props?.slot_timing || "").trim();

  if (!ownerId) {
    console.log(`⏭️ No owner assigned for ticketId: ${ticketId} — skipping`);
    return { success: false, reason: "No owner assigned yet." };
  }

  const ownerEmail    = await fetchOwnerEmail(ownerId, headers);
  const notifyEmail   = ownerEmail;
  const action        = successFlag === "Rescheduled" ? "reschedule" : "new";
  const formattedDate = formatDateForEmail(dateOfAppointment);

  console.log(`👤 Owner: ${ownerEmail} | Action: ${action} | Date: ${formattedDate}`);

  const assocRes = await axios.get(
    `https://api.hubapi.com/crm/v3/objects/tickets/${ticketId}/associations/contacts`,
    { headers }
  );

  const contactId = assocRes?.data?.results?.[0]?.id || "";
  let contactFirstName = "";
  let contactLastName  = "";
  let contactEmail     = "";

  if (contactId) {
    const contactRes = await axios.get(
      `https://api.hubapi.com/crm/v3/objects/contacts/${contactId}?properties=firstname,lastname,email`,
      { headers }
    );
    const cProps     = contactRes?.data?.properties || {};
    contactFirstName = String(cProps?.firstname || "").trim();
    contactLastName  = String(cProps?.lastname  || "").trim();
    contactEmail     = String(cProps?.email     || "").trim();
  }

  // ── 1) Set Ticket to Scheduled ───────────────────────────
  await axios.patch(
    `https://api.hubapi.com/crm/v3/objects/tickets/${ticketId}`,
    { properties: { hs_pipeline_stage: stages.SCHEDULED } },
    { headers }
  );
  console.log(`✅ Ticket ${ticketId} moved to Scheduled`);

  // ── 2) Create Note ───────────────────────────────────────
  await axios.post(
    "https://api.hubapi.com/crm/v3/objects/notes",
    {
      properties: {
        hs_note_body: [
          `[${successFlag}] This request has been scheduled.`,
          `Appointment ID: ${ticketId}`,
          `Owner: ${ownerEmail}`,
          `Date of appointment: ${formattedDate}`,
          `Time slot: ${slotTiming}`,
          `Purpose: ${content}`,
          `Contact Name: ${contactFirstName} ${contactLastName}`,
          `Contact Email: ${contactEmail}`,
        ].join("\n"),
        hs_timestamp: Date.now(),
      },
      associations: [{ to: { id: ticketId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 18 }] }],
    },
    { headers }
  );
  console.log(`✅ Note created for ticketId: ${ticketId}`);

  // ── Build Cancel URL ─────────────────────────────────────
  const cancelUrl = `https://campaign.worldfirst.com/${region.toLowerCase()}-cancellation-appointment` +
    `?title=${encodeURIComponent(content)}` +
    `&date=${encodeURIComponent(formattedDate)}` +
    `&time=${encodeURIComponent(slotTiming)}` +
    `&id=${ticketId}` +
    `&ticket_id=${ticketId}` +
    `&email=${encodeURIComponent(contactEmail)}` +
    `&region=${encodeURIComponent(region)}` +
    `&uid=${encodeURIComponent(`hs-${ticketId}@woven.sg`)}`;

  // ── Build Reschedule URL ─────────────────────────────────
  const rescheduleUrl = `https://campaign.worldfirst.com/${region.toLowerCase()}-rescheduling-appointment-page` +
    `?title=${encodeURIComponent(content)}` +
    `&date=${encodeURIComponent(formattedDate)}` +
    `&time=${encodeURIComponent(slotTiming)}` +
    `&id=${ticketId}` +
    `&ticket_id=${ticketId}` +
    `&email=${encodeURIComponent(contactEmail)}` +
    `&region=${encodeURIComponent(region)}`;

  // ── Build Customer HTML ──────────────────────────────────
  const customerHtml = `
    <p>Your telesales appointment has been ${successFlag.toLowerCase()}.</p>
    <p>
      <strong>Appointment ID:</strong> ${ticketId}<br/>
      <strong>Date:</strong> ${formattedDate}<br/>
      <strong>Time:</strong> ${slotTiming}<br/>
      <strong>Location:</strong> Online
    </p>
    <p>The calendar invite is attached.</p>
    <table style="margin-top:20px;">
      <tr>
        <td style="padding-right:10px;">
          <a href="${rescheduleUrl}"
             style="display:inline-block;padding:10px 18px;background:#3182ce;color:#fff;border-radius:6px;text-decoration:none;font-weight:bold;">
            Reschedule
          </a>
        </td>
        <td>
          <a href="${cancelUrl}"
             style="display:inline-block;padding:10px 18px;background:#e53e3e;color:#fff;border-radius:6px;text-decoration:none;font-weight:bold;">
            Cancel Appointment
          </a>
        </td>
      </tr>
    </table>
    <p style="margin-top:14px;color:#999;font-size:12px;">
      Use the buttons above to reschedule or cancel your appointment.
    </p>
  `;

  // ── 3) Send Customer ICS Email ───────────────────────────
  if (contactEmail) {
    try {
      const customerPayload = {
        to:                  contactEmail,
        from_email:          FROM_EMAIL,
        fromName:            "Internal Telesales Team",
        title:               "Telesales Appointment",
        appointment_id:      ticketId,
        ticket_id:           ticketId,
        date:                formattedDate,
        time:                slotTiming,
        telesales:           ownerEmail,
        location:            "Online",
        action:              action,
        timezoneOffsetHours: timezoneOffsetHours,
        html:                customerHtml,
      };
      console.log("📤 SENDING CUSTOMER ICS EMAIL:", customerPayload);
      const customerRes = await axios.post(SERVERLESS_URL, customerPayload, {
        headers: { "Content-Type": "application/json" },
        timeout: 20000,
      });
      console.log("✅ CUSTOMER EMAIL RESPONSE:", customerRes.data);
    } catch (err) {
      console.error(`⚠️ Customer ICS email failed:`, err.response?.data || err.message);
    }
  }

  // ── 4) Send Owner ICS Email ──────────────────────────────
  if (notifyEmail) {
    try {
      const ownerPayload = {
        to:                  notifyEmail,
        from_email:          FROM_EMAIL,
        fromName:            "Internal Telesales Team",
        title:               "Telesales Appointment",
        appointment_id:      ticketId,
        ticket_id:           ticketId,
        date:                formattedDate,
        time:                slotTiming,
        telesales:           ownerEmail,
        location:            "Online",
        action:              action,
        timezoneOffsetHours: timezoneOffsetHours,
      };
      console.log("📤 SENDING OWNER ICS EMAIL:", ownerPayload);
      const ownerRes = await axios.post(SERVERLESS_URL, ownerPayload, {
        headers: { "Content-Type": "application/json" },
        timeout: 20000,
      });
      console.log("✅ OWNER EMAIL RESPONSE:", ownerRes.data);
    } catch (err) {
      console.error(`⚠️ Owner ICS email failed:`, err.response?.data || err.message);
    }
  }

  return {
    success:     true,
    owner:       ownerEmail,
    region_used: region,
    action:      action,
  };
}

// ── Reschedule Submission ────────────────────────────────────

async function handleRescheduleSubmission({ contactId, payload, headers }) {
  if (!payload) throw new Error("request_reschedule_payload is empty.");

  const parts = payload.split("#").map((s) => s.trim());
  if (parts.length !== 3) throw new Error(`Invalid payload format: expected ticketId#dateMs#timeText. Got: ${payload}`);

  const [ticketId, dateMs, timeText] = parts;
  if (!ticketId) throw new Error("Missing ticket id in payload.");
  if (!/^\d+$/.test(dateMs)) throw new Error(`dateMs must be digits only. Got: ${dateMs}`);

  const ticketRes = await axios.get(
    `https://api.hubapi.com/crm/v3/objects/tickets/${ticketId}?properties=region,hs_pipeline_stage`,
    { headers }
  );

  const props  = ticketRes?.data?.properties || {};
  const region = String(props?.region || "").trim().toUpperCase();
  const stages = PIPELINE_STAGES[region];
  if (!stages) throw new Error(`Unsupported or missing region: ${region}`);

  await axios.patch(
    `https://api.hubapi.com/crm/v3/objects/tickets/${encodeURIComponent(ticketId)}`,
    {
      properties: {
        hs_pipeline_stage:      stages.RESCHEDULE_ALLOCATING,
        [TICKET_DATE_PROPERTY]: dateMs,
        [TICKET_TIME_PROPERTY]: timeText,
      },
    },
    { headers }
  );

  await axios.post(
    "https://api.hubapi.com/crm/v3/objects/notes",
    {
      properties: {
        hs_note_body: "[Rescheduled] Customer rescheduled this ticket.",
        hs_timestamp: Date.now(),
      },
      associations: [{ to: { id: ticketId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 18 }] }],
    },
    { headers }
  );

  console.log(`✅ Reschedule submission complete — ticketId: ${ticketId}`);
  return { status: "updated", ticket_id: ticketId, date_ms: dateMs, time_text: timeText, region_used: region };
}

// ── Cancel Submission ────────────────────────────────────────

async function handleCancelSubmission({ contactId, ticketId, headers }) {
  if (!ticketId) throw new Error("request_cancel_ticket_id is empty.");

  // ── Fetch full ticket details ────────────────────────────
  const ticketRes = await axios.get(
    `https://api.hubapi.com/crm/v3/objects/tickets/${ticketId}?properties=region,hs_pipeline_stage,hubspot_owner_id,date_of_appointment,slot_timing`,
    { headers }
  );

  const props             = ticketRes?.data?.properties || {};
  const region            = String(props?.region || "").trim().toUpperCase();
  const ownerId           = String(props?.hubspot_owner_id || "").trim();
  const dateOfAppointment = String(props?.date_of_appointment || "").trim();
  const slotTiming        = String(props?.slot_timing || "").trim();
  const stages            = PIPELINE_STAGES[region];
  if (!stages) throw new Error(`Unsupported or missing region: ${region}`);

  const timezoneOffsetHours = TIMEZONE_OFFSET[region] ?? 0;
  const formattedDate       = formatDateForEmail(dateOfAppointment);

  // ── Fetch owner email ────────────────────────────────────
  const ownerEmail = ownerId ? await fetchOwnerEmail(ownerId, headers) : "";

  // ── Fetch associated contact email ───────────────────────
  const assocRes = await axios.get(
    `https://api.hubapi.com/crm/v3/objects/tickets/${ticketId}/associations/contacts`,
    { headers }
  );

  const assocContactId = assocRes?.data?.results?.[0]?.id || "";
  let contactEmail     = "";

  if (assocContactId) {
    const contactRes = await axios.get(
      `https://api.hubapi.com/crm/v3/objects/contacts/${assocContactId}?properties=email`,
      { headers }
    );
    contactEmail = String(contactRes?.data?.properties?.email || "").trim();
  }

  // ── 1) Set Ticket to Cancelled ───────────────────────────
  await axios.patch(
    `https://api.hubapi.com/crm/v3/objects/tickets/${encodeURIComponent(ticketId)}`,
    { properties: { hs_pipeline_stage: stages.CANCELLED } },
    { headers }
  );
  console.log(`✅ Ticket ${ticketId} moved to Cancelled`);

  // ── 2) Create Note ───────────────────────────────────────
  await axios.post(
    "https://api.hubapi.com/crm/v3/objects/notes",
    {
      properties: {
        hs_note_body: "[Cancel] Customer cancelled this request.",
        hs_timestamp: Date.now(),
      },
      associations: [{ to: { id: ticketId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 18 }] }],
    },
    { headers }
  );
  console.log(`✅ Cancel note created for ticketId: ${ticketId}`);

  // ── 3) Send Cancel ICS Email to Customer ─────────────────
  if (contactEmail) {
    try {
      const customerCancelPayload = {
        to:                  contactEmail,
        from_email:          FROM_EMAIL,
        fromName:            "Internal Telesales Team",
        title:               "Telesales Appointment",
        appointment_id:      ticketId,
        ticket_id:           ticketId,
        date:                formattedDate,
        time:                slotTiming,
        telesales:           ownerEmail,
        location:            "Online",
        action:              "cancel",
        timezoneOffsetHours: timezoneOffsetHours,
      };
      console.log("📤 SENDING CUSTOMER CANCEL ICS EMAIL:", customerCancelPayload);
      const customerRes = await axios.post(SERVERLESS_URL, customerCancelPayload, {
        headers: { "Content-Type": "application/json" },
        timeout: 20000,
      });
      console.log("✅ CUSTOMER CANCEL EMAIL RESPONSE:", customerRes.data);
    } catch (err) {
      console.error(`⚠️ Customer cancel ICS email failed:`, err.response?.data || err.message);
    }
  }

  // ── 4) Send Cancel ICS Email to Owner ────────────────────
  if (ownerEmail) {
    try {
      const ownerCancelPayload = {
        to:                  ownerEmail,
        from_email:          FROM_EMAIL,
        fromName:            "Internal Telesales Team",
        title:               "Telesales Appointment",
        appointment_id:      ticketId,
        ticket_id:           ticketId,
        date:                formattedDate,
        time:                slotTiming,
        telesales:           ownerEmail,
        location:            "Online",
        action:              "cancel",
        timezoneOffsetHours: timezoneOffsetHours,
      };
      console.log("📤 SENDING OWNER CANCEL ICS EMAIL:", ownerCancelPayload);
      const ownerRes = await axios.post(SERVERLESS_URL, ownerCancelPayload, {
        headers: { "Content-Type": "application/json" },
        timeout: 20000,
      });
      console.log("✅ OWNER CANCEL EMAIL RESPONSE:", ownerRes.data);
    } catch (err) {
      console.error(`⚠️ Owner cancel ICS email failed:`, err.response?.data || err.message);
    }
  }

  console.log(`✅ Cancel submission complete — ticketId: ${ticketId}`);
  return { status: "updated", ticket_id: ticketId, region_used: region };
}

// ── Allocation Flow ──────────────────────────────────────────

async function runAllocationFlow({ ticketId, region, headers }) {
  const rescheduleResult = await handleRescheduleCheck({ ticketId, region, headers });
  console.log(`✅ Reschedule Check:`, rescheduleResult);

  const conflictResult = await handleSlotConflict({ ticketId, region, headers });
  console.log(`✅ Slot Conflict:`, conflictResult);

  await axios.patch(
    `https://api.hubapi.com/crm/v3/objects/tickets/${ticketId}`,
    { properties: { hs_pipeline_stage: PIPELINE_STAGES[region].ALLOCATING } },
    { headers }
  );
  console.log(`✅ Ticket ${ticketId} moved to Allocating`);

  if (conflictResult.is_conflicted) {
    const result = await handleConflict({
      ticketId,
      region,
      successFlag:  rescheduleResult.successFlag,
      conflictData: conflictResult,
      headers,
    });
    console.log(`✅ Conflict Handler:`, result);
  } else {
    const result = await handleScheduled({
      ticketId,
      region,
      successFlag: rescheduleResult.successFlag,
      headers,
    });
    console.log(`✅ Scheduled Handler:`, result);
  }
}

// ── Main Handler ─────────────────────────────────────────────

exports.main = async (context) => {
  const HUBSPOT_TOKEN = process.env.PRIVATE_APP_ACCESS_TOKEN;

  const headers = {
    Authorization: `Bearer ${HUBSPOT_TOKEN}`,
    "Content-Type": "application/json",
  };

  const events = Array.isArray(context?.body) ? context.body : [context?.body];
  console.log(`📥 Received ${events.length} event(s)`);

  for (const evt of events) {
    const eventType    = String(evt?.subscriptionType || "").trim();
    const propertyName = String(evt?.propertyName || "").trim();
    const newValue     = String(evt?.propertyValue || "").trim();
    const objectId     = String(evt?.objectId || "").trim();

    console.log(`\n🔔 Event: ${eventType} | Property: ${propertyName} | Value: ${newValue} | ID: ${objectId}`);

    if (!objectId || !eventType) {
      console.warn("⚠️ Skipping event — missing objectId or eventType");
      continue;
    }

    try {

      // ── TICKET: Owner Assigned → known ───────────────────
      if (
        eventType === "ticket.propertyChange" &&
        propertyName === "hubspot_owner_id" &&
        newValue
      ) {
        const ticketProps  = await fetchTicketProps(objectId, headers);
        const region       = String(ticketProps?.region || "").trim().toUpperCase();
        const currentStage = String(ticketProps?.hs_pipeline_stage || "").trim();

        if (!PIPELINE_STAGES[region]) {
          console.log(`⏭️ Unsupported region ${region} — skipping`);
          continue;
        }

        if (isSkippableStage(region, currentStage)) {
          console.log(`⏭️ Ticket ${objectId} already in ${currentStage} — skipping`);
          continue;
        }

        console.log(`🎯 Owner assigned for ticket ${objectId} (${region}) — running allocation`);
        await runAllocationFlow({ ticketId: objectId, region, headers });
        continue;
      }

      // ── TICKET: Slot Timing → known ──────────────────────
      if (
        eventType === "ticket.propertyChange" &&
        propertyName === "slot_timing" &&
        newValue
      ) {
        const ticketProps  = await fetchTicketProps(objectId, headers);
        const region       = String(ticketProps?.region || "").trim().toUpperCase();
        const currentStage = String(ticketProps?.hs_pipeline_stage || "").trim();
        const ownerId      = String(ticketProps?.hubspot_owner_id || "").trim();

        if (!PIPELINE_STAGES[region]) {
          console.log(`⏭️ Unsupported region ${region} — skipping`);
          continue;
        }

        if (isSkippableStage(region, currentStage)) {
          console.log(`⏭️ Ticket ${objectId} already in ${currentStage} — skipping`);
          continue;
        }

        if (!ownerId) {
          console.log(`⏭️ No owner yet for ticket ${objectId} — skipping`);
          continue;
        }

        console.log(`🎯 Slot timing changed for ticket ${objectId} (${region}) — running allocation`);
        await runAllocationFlow({ ticketId: objectId, region, headers });
        continue;
      }

      // ── TICKET: Date of Appointment → known ──────────────
      if (
        eventType === "ticket.propertyChange" &&
        propertyName === "date_of_appointment" &&
        newValue
      ) {
        const ticketProps  = await fetchTicketProps(objectId, headers);
        const region       = String(ticketProps?.region || "").trim().toUpperCase();
        const currentStage = String(ticketProps?.hs_pipeline_stage || "").trim();
        const ownerId      = String(ticketProps?.hubspot_owner_id || "").trim();

        if (!PIPELINE_STAGES[region]) {
          console.log(`⏭️ Unsupported region ${region} — skipping`);
          continue;
        }

        if (isSkippableStage(region, currentStage)) {
          console.log(`⏭️ Ticket ${objectId} already in ${currentStage} — skipping`);
          continue;
        }

        if (!ownerId) {
          console.log(`⏭️ No owner yet for ticket ${objectId} — skipping`);
          continue;
        }

        console.log(`🎯 Date changed for ticket ${objectId} (${region}) — running allocation`);
        await runAllocationFlow({ ticketId: objectId, region, headers });
        continue;
      }

      // ── CONTACT: Reschedule Payload → known ──────────────
      if (
        eventType === "contact.propertyChange" &&
        propertyName === "request_reschedule_payload" &&
        newValue
      ) {
        console.log(`🎯 Reschedule payload for contact ${objectId} — running reschedule submission`);
        const result = await handleRescheduleSubmission({ contactId: objectId, payload: newValue, headers });
        console.log(`✅ Reschedule Submission:`, result);
        continue;
      }

      // ── CONTACT: Cancel Ticket ID → known ────────────────
      if (
        eventType === "contact.propertyChange" &&
        propertyName === "request_cancel_ticket_id" &&
        newValue
      ) {
        console.log(`🎯 Cancel request for contact ${objectId} — running cancel submission`);
        const result = await handleCancelSubmission({ contactId: objectId, ticketId: newValue, headers });
        console.log(`✅ Cancel Submission:`, result);
        continue;
      }

      console.log(`⏭️ No handler matched for event: ${eventType} | ${propertyName}`);

    } catch (err) {
      console.error(`🔥 Error processing event [${eventType}|${propertyName}|${objectId}]:`, err.message);
    }
  }

  return {
    statusCode: 200,
    body: { status: "processed" },
  };
};
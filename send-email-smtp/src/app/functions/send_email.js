const nodemailer = require("nodemailer");

// =========================
// HELPERS
// =========================
function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatUtcIcs(dt) {
  return dt.getUTCFullYear()
    + pad2(dt.getUTCMonth() + 1)
    + pad2(dt.getUTCDate())
    + "T"
    + pad2(dt.getUTCHours())
    + pad2(dt.getUTCMinutes())
    + pad2(dt.getUTCSeconds())
    + "Z";
}

function normalizeSpaces(s) {
  return String(s || "")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeIcsText(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function parseDateFlexible(dateInput) {
  if (!dateInput) return null;

  if (!isNaN(dateInput)) {
    const dt = new Date(Number(dateInput));
    return {
      y:  dt.getUTCFullYear(),
      mo: dt.getUTCMonth() + 1,
      d:  dt.getUTCDate()
    };
  }

  const raw = normalizeSpaces(dateInput);

  let m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return { y: +m[1], mo: +m[2], d: +m[3] };

  m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (m) {
    const mo = +m[1];
    const d  = +m[2];
    const y  = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return { y, mo, d };
  }

  return null;
}

function parseClock12h(s) {
  if (!s) return null;

  const raw = normalizeSpaces(s).toUpperCase();
  const m   = raw.match(/^(\d{1,2})(?:[.:](\d{2}))?\s*(AM|PM)$/);

  if (!m) return null;

  let hh     = parseInt(m[1], 10);
  const mm   = m[2] ? parseInt(m[2], 10) : 0;
  const ap   = m[3];

  if (ap === "AM") {
    if (hh === 12) hh = 0;
  } else {
    if (hh !== 12) hh += 12;
  }

  return { hh, mm };
}

function parseTimeRange(rangeStr) {
  if (!rangeStr) return null;

  const raw   = normalizeSpaces(rangeStr);
  const parts = raw.split(/\s*-\s*/);

  if (parts.length !== 2) return null;

  const start = parseClock12h(parts[0]);
  const end   = parseClock12h(parts[1]);

  if (!start || !end) return null;

  return { start, end };
}

function buildUtcFromOffsetLocal(dateObj, hh, mm, timezoneOffsetHours) {
  const local = new Date(Date.UTC(dateObj.y, dateObj.mo - 1, dateObj.d, hh, mm));
  return new Date(local.getTime() - (timezoneOffsetHours * 60 * 60 * 1000));
}

function buildIcs({
  appointmentId,
  ticketId,
  title,
  attendeeEmail,
  telesales,
  appointmentDate,
  appointmentTime,
  location,
  action,
  timezoneOffsetHours,
  organizerEmail
}) {
  const dateObj = parseDateFlexible(appointmentDate);
  const timeObj = parseTimeRange(appointmentTime);

  if (!dateObj) throw new Error("Invalid appointmentDate format");
  if (!timeObj) throw new Error("Invalid appointmentTime format");

  const startUtc = buildUtcFromOffsetLocal(
    dateObj,
    timeObj.start.hh,
    timeObj.start.mm,
    timezoneOffsetHours
  );

  let endUtc = buildUtcFromOffsetLocal(
    dateObj,
    timeObj.end.hh,
    timeObj.end.mm,
    timezoneOffsetHours
  );

  if (endUtc <= startUtc) {
    endUtc = new Date(endUtc.getTime() + 86400000);
  }

  const isCancel     = String(action || "new").toLowerCase() === "cancel";
  const isReschedule = String(action || "new").toLowerCase() === "reschedule";
  const sequence     = isCancel || isReschedule ? 1 : 0;
  const method       = isCancel ? "CANCEL" : "REQUEST";
  const status       = isCancel ? "CANCELLED" : "CONFIRMED";

  const uid = `hs-${appointmentId}@woven.sg`;
  const description = [
    `Appointment ID: ${appointmentId}`,
    `Ticket: ${ticketId || ""}`,
    `Email: ${attendeeEmail}`,
    `Telesales: ${telesales || ""}`,
    `Date: ${appointmentDate}`,
    `Time: ${appointmentTime}`
  ].join("\\n");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//HubSpot//ICS Generator//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:"   + method,
    "BEGIN:VEVENT",
    "UID:"      + escapeIcsText(uid),
    "DTSTAMP:"  + formatUtcIcs(new Date()),
    "SEQUENCE:" + sequence,
    "STATUS:"   + status,
    "DTSTART:"  + formatUtcIcs(startUtc),
    "DTEND:"    + formatUtcIcs(endUtc),
    "SUMMARY:"  + escapeIcsText(title),
    "DESCRIPTION:" + escapeIcsText(description),
    "LOCATION:" + escapeIcsText(location),
    "ORGANIZER;CN=Telesales Team:MAILTO:" + organizerEmail,
    "ATTENDEE;CN=" + escapeIcsText(attendeeEmail) + ";RSVP=FALSE:MAILTO:" + attendeeEmail,
    "END:VEVENT",
    "END:VCALENDAR"
  ].join("\r\n");
}

function buildEmailText({ appointmentId, ticketId, appointmentDate, appointmentTime, location, isCancel }) {
  const statusText = isCancel ? "cancelled" : "scheduled";
  return `Your telesales appointment has been ${statusText}.

Appointment ID: ${appointmentId}
Ticket: ${ticketId || ""}
Date: ${appointmentDate}
Time: ${appointmentTime}
Location: ${location}

The calendar ${isCancel ? "cancellation" : "invite"} is attached.`;
}

function buildEmailHtml({ appointmentId, ticketId, appointmentDate, appointmentTime, location, isCancel }) {
  const statusText = isCancel ? "cancelled" : "scheduled";
  return `
    <p>Your telesales appointment has been <strong>${statusText}</strong>.</p>
    <p>
      <strong>Appointment ID:</strong> ${appointmentId}<br/>
      <strong>Ticket:</strong> ${ticketId || ""}<br/>
      <strong>Date:</strong> ${appointmentDate}<br/>
      <strong>Time:</strong> ${appointmentTime}<br/>
      <strong>Location:</strong> ${location}
    </p>
    <p>The calendar ${isCancel ? "cancellation file" : "invite"} is attached.</p>
  `;
}

exports.main = async (context = {}) => {
  try {
    const body = context.body || {};

    const to              = body.to || body.email;
    const fromEmail       = body.fromEmail || body.from_email;
    const fromName        = body.fromName || "Telesales Team";
    const baseTitle       = body.title || "Telesales Appointment";
    const appointmentId   = body.appointmentId || body.appointment_id;
    const ticketId        = body.ticketId || body.ticket_id;
    const appointmentDate = body.appointmentDate || body.app_date || body.date;
    const appointmentTime = body.appointmentTime || body.app_time || body.time;
    const telesales       = body.telesales;
    const location        = body.location || "Online";
    const action          = body.action || "new";

    // ── Derive flags at top level so accessible everywhere ──
    const isCancel     = String(action).toLowerCase() === "cancel";
    const isReschedule = String(action).toLowerCase() === "reschedule";

    const timezoneOffsetHours = Number(body.timezoneOffsetHours ?? body.timezone_offset_hours ?? 8);

    const subject = body.subject ||
      `${baseTitle} | ${appointmentId || "No Appointment ID"} | ${appointmentDate || "No Date"} ${appointmentTime || ""}`;

    if (!to)                              throw new Error("Missing to or email");
    if (!fromEmail)                       throw new Error("Missing fromEmail or from_email");
    if (!appointmentId)                   throw new Error("Missing appointmentId or appointment_id");
    if (!appointmentDate)                 throw new Error("Missing appointmentDate or date");
    if (!appointmentTime)                 throw new Error("Missing appointmentTime or time");
    if (!Number.isFinite(timezoneOffsetHours)) throw new Error("Invalid timezoneOffsetHours");

    const ics = buildIcs({
      appointmentId,
      ticketId,
      title:               baseTitle,
      attendeeEmail:       to,
      telesales,
      appointmentDate,
      appointmentTime,
      location,
      action,
      timezoneOffsetHours,
      organizerEmail:      fromEmail
    });

    const transporter = nodemailer.createTransport({
      host:   process.env.SMTP_HOST || "smtp.hubapi.com",
      port:   587,
      secure: false,
      auth: {
        user: process.env.SMTP_USERNAME,
        pass: process.env.SMTP_PASSWORD
      }
    });

    const result = await transporter.sendMail({
      from:    `"${fromName}" <${fromEmail}>`,
      to,
      subject,
      text: body.text || buildEmailText({
        appointmentId,
        ticketId,
        appointmentDate,
        appointmentTime,
        location,
        isCancel
      }),
      html: body.html || buildEmailHtml({
        appointmentId,
        ticketId,
        appointmentDate,
        appointmentTime,
        location,
        isCancel
      }),
      attachments: [
        {
          filename:    body.filename || (isCancel ? "cancel.ics" : "invite.ics"),
          content:     Buffer.from(ics, "utf8"),
          contentType: `text/calendar; charset=utf-8; method=${isCancel ? "CANCEL" : "REQUEST"}`
        }
      ]
    });

    return {
      statusCode: 200,
      body: {
        status:    "success",
        messageId: result.messageId
      }
    };

  } catch (err) {
    console.error("SMTP SEND ERROR:", err.message);

    return {
      statusCode: 500,
      body: {
        status:  "error",
        message: err.message
      }
    };
  }
};
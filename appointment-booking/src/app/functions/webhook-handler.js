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

const OWNER_POOL = {
  EEA: ["EEA_OWNER_ID_1", "EEA_OWNER_ID_2", "EEA_OWNER_ID_3"],
  UK:  ["UK_OWNER_ID_1",  "UK_OWNER_ID_2",  "UK_OWNER_ID_3"],
};

const TIMEZONE_OFFSET = { EEA: 1, UK: 0 };

const SERVERLESS_URL       = "https://campaign.worldfirst.com/hs/serverless/send_email";
const FROM_EMAIL           = "no-reply@service.worldfirst.com";
const TICKET_DATE_PROPERTY = "date_of_appointment";
const TICKET_TIME_PROPERTY = "slot_timing";

// ── Email HTML Builder ────────────────────────────────────────

function buildCustomerHtml({ ticketId, formattedDate, slotTiming, successFlag, rescheduleUrl, cancelUrl }) {
  const isRescheduled = successFlag === "Rescheduled";
  const statusColor   = isRescheduled ? "#1565c0" : "#2e7d32";
  const statusBg      = isRescheduled ? "#e3f2fd" : "#e8f5e9";
  const statusBorder  = isRescheduled ? "#bbdefb" : "#c8e6c9";
  const calIcon       = isRescheduled ? "🔄" : "📅";
  const calMsg        = isRescheduled
    ? "Your calendar event has been updated automatically. Open the attached file if it doesn't update."
    : "The calendar invite is attached. Open it to add the appointment to your calendar automatically.";
  const rescheduleLabel = isRescheduled ? "Reschedule Again" : "Reschedule Appointment";

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:32px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

  <!-- HEADER -->
  <tr>
    <td style="background:#0d2137;padding:24px 36px;">
      <table width="100%" cellpadding="0" cellspacing="0"><tr>
        <td>
          <table cellpadding="0" cellspacing="0"><tr>
            <td style="vertical-align:middle;padding:4px 0;">
            <img src="https://mdn.marmot-cloud.com/worldfirst/sites/38/2026/04/20260424113953863.svg" width=150 />
            </td>
          </tr></table>
        </td>
        <td align="right" style="vertical-align:middle;">
          <span style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#4a9eff;background:rgba(74,158,255,0.12);padding:4px 12px;border-radius:20px;border:1px solid rgba(74,158,255,0.25);">Telesales</span>
        </td>
      </tr></table>
    </td>
  </tr>

  <!-- HERO -->
  <tr>
    <td style="padding:32px 36px 24px;border-bottom:1px solid #f0f3f7;">
      <div style="display:inline-block;padding:5px 12px;border-radius:20px;background:${statusBg};border:1px solid ${statusBorder};margin-bottom:14px;">
        <span style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:${statusColor};">● Appointment ${successFlag}</span>
      </div>
      <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#0d2137;line-height:1.3;">Your appointment has been ${successFlag.toLowerCase()}.</h1>
      <p style="margin:0;font-size:14px;color:#64748b;line-height:1.6;">Your telesales session is confirmed. The calendar invite is attached to this email.</p>
    </td>
  </tr>

  <!-- APPOINTMENT CARD -->
  <tr>
    <td style="padding:24px 36px 0;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e8edf5;border-radius:12px;overflow:hidden;">
        <tr>
          <td style="background:#0d2137;padding:14px 20px;">
            <table width="100%" cellpadding="0" cellspacing="0"><tbody><tr>
              <td><span style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#94a9c0;font-weight:600">Cancelled Appointment</span></td>
              
            </tr></tbody></table>
          </td>
        <td style="background:#0d2137;padding:14px 20px;">
            <table width="100%" cellpadding="0" cellspacing="0"><tbody><tr>
              
              <td align="left"><span style="font-size:12px;color:#4a9eff;font-weight:600">#45554288035</span></td>
            </tr></tbody></table>
          </td></tr>
        <tr>
          <td width="50%" style="padding:16px 20px;border-bottom:1px solid #e8edf5;border-right:1px solid #e8edf5;vertical-align:top;">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#94a3b8;font-weight:600;margin-bottom:4px;">Date</div>
            <div style="font-size:14px;color:#0d2137;font-weight:600;">${formattedDate}</div>
          </td>
          <td width="50%" style="padding:16px 20px;border-bottom:1px solid #e8edf5;vertical-align:top;">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#94a3b8;font-weight:600;margin-bottom:4px;">Time</div>
            <div style="font-size:14px;color:#1a6fff;font-weight:600;">${slotTiming}</div>
          </td>
        </tr>
        <tr>
          <td width="50%" style="padding:16px 20px;border-right:1px solid #e8edf5;vertical-align:top;">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#94a3b8;font-weight:600;margin-bottom:4px;">Location</div>
            <div style="font-size:14px;color:#0d2137;font-weight:600;">Online</div>
          </td>
          <td width="50%" style="padding:16px 20px;vertical-align:top;">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#94a3b8;font-weight:600;margin-bottom:4px;">Appointment ID</div>
            <div style="font-size:14px;color:#0d2137;font-weight:600;">${ticketId}</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- CALENDAR NOTE -->
  <tr>
    <td style="padding:16px 36px 0;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#e8f4ff,#f0f8ff);border:1px solid #c5dfff;border-radius:10px;">
        <tr><td style="padding:14px 18px;">
          <table cellpadding="0" cellspacing="0"><tr>
            <td style="font-size:20px;padding-right:12px;vertical-align:middle;">${calIcon}</td>
            <td style="font-size:13px;color:#1a4a80;line-height:1.5;vertical-align:middle;">${calMsg}</td>
          </tr></table>
        </td></tr>
      </table>
    </td>
  </tr>

  <!-- BUTTONS -->
  <tr>
    <td style="padding:20px 36px 24px;">
      <table width="100%" cellpadding="0" cellspacing="0"><tr>
        <td width="48%" style="padding-right:8px;">
          <a href="${rescheduleUrl}" style="display:block;background:#1a6fff;color:#ffffff;text-decoration:none;padding:14px 20px;border-radius:10px;font-size:14px;font-weight:600;text-align:center;">${rescheduleLabel}</a>
        </td>
        <td width="48%" style="padding-left:8px;">
          <a href="${cancelUrl}" style="display:block;background:#ffffff;color:#dc2626;text-decoration:none;padding:13px 20px;border-radius:10px;font-size:14px;font-weight:600;text-align:center;border:1.5px solid #fca5a5;">Cancel Appointment</a>
        </td>
      </tr></table>
    </td>
  </tr>

  <!-- DIVIDER -->
  <tr><td style="padding:0 36px;"><div style="height:1px;background:#f0f3f7;"></div></td></tr>

  <!-- HELP -->
  <tr>
    <td style="padding:20px 36px;text-align:center;">
      <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.6;">Need help? Contact your telesales representative or visit our <a href="https://www.worldfirst.com/global/help-center/" style="color:#1a6fff;text-decoration:none;font-weight:500;">Help Centre</a>.</p>
    </td>
  </tr>

  <!-- FOOTER -->
  <tr>
    <td style="background:#f8fafc;border-top:1px solid #e8edf5;padding:24px 36px;">
      <table cellpadding="0" cellspacing="0" style="margin-bottom:10px;"><tr>
        <td style="vertical-align:middle;">
        <img src="https://mdn.marmot-cloud.com/worldfirst/sites/38/2026/04/20260424113953863.svg" width=150 />
        </td>
      </tr></table>
      <p style="margin:0 0 8px;font-size:12px;color:#94a3b8;line-height:1.7;">This email was sent by the WorldFirst Internal Telesales Team.<br/>© 2026 WorldFirst — Ant International. All rights reserved.</p>
      <table cellpadding="0" cellspacing="0"><tr>
        <td style="padding-right:14px;"><a href="https://www.worldfirst.com/global/privacy-policy/" style="font-size:12px;color:#64748b;text-decoration:none;">Privacy Policy</a></td>
        <td style="padding-right:14px;"><a href="https://www.worldfirst.com/global/legal/" style="font-size:12px;color:#64748b;text-decoration:none;">Legal</a></td>
        <td><a href="https://www.worldfirst.com/global/help-support/contact-us/" style="font-size:12px;color:#64748b;text-decoration:none;">Contact Us</a></td>
      </tr></table>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

function buildOwnerHtml({ ticketId, formattedDate, slotTiming, contactEmail, successFlag }) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:32px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

  <!-- INTERNAL BANNER -->
  <tr>
    <td style="background:linear-gradient(135deg,#2d1b4e,#1a0a3a);padding:10px 36px;text-align:center;">
      <span style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#c084fc;font-weight:600;">⚙ Internal — Telesales Team Only</span>
    </td>
  </tr>

  <!-- HEADER -->
  <tr>
    <td style="background:#0d2137;padding:24px 36px;">
      <table width="100%" cellpadding="0" cellspacing="0"><tr>
        <td>
          <table cellpadding="0" cellspacing="0"><tr>
            <td style="vertical-align:middle;padding:4px 0;">
            <img src="https://mdn.marmot-cloud.com/worldfirst/sites/38/2026/04/20260424113953863.svg" width=150 />
            </td>
          </tr></table>
        </td>
        <td align="right" style="vertical-align:middle;">
          <span style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#c084fc;background:rgba(192,132,252,0.12);padding:4px 12px;border-radius:20px;border:1px solid rgba(192,132,252,0.25);">Internal</span>
        </td>
      </tr></table>
    </td>
  </tr>

  <!-- HERO -->
  <tr>
    <td style="padding:32px 36px 24px;border-bottom:1px solid #f0f3f7;">
      <div style="display:inline-block;padding:5px 12px;border-radius:20px;background:#f3e5f5;border:1px solid #e1bee7;margin-bottom:14px;">
        <span style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#6a1b9a;">● New Assignment</span>
      </div>
      <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#0d2137;line-height:1.3;">You have a new telesales appointment.</h1>
      <p style="margin:0;font-size:14px;color:#64748b;line-height:1.6;">A customer appointment has been ${successFlag.toLowerCase()} and assigned to you. The calendar invite is attached.</p>
    </td>
  </tr>

  <!-- APPOINTMENT CARD -->
  <tr>
    <td style="padding:24px 36px 0;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e8edf5;border-radius:12px;overflow:hidden;">
        <tr>
          <td style="background:#0d2137;padding:14px 20px;">
            <table width="100%" cellpadding="0" cellspacing="0"><tbody><tr>
              <td><span style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#94a9c0;font-weight:600">Cancelled Appointment</span></td>
              
            </tr></tbody></table>
          </td>
        <td style="background:#0d2137;padding:14px 20px;">
            <table width="100%" cellpadding="0" cellspacing="0"><tbody><tr>
              
              <td align="left"><span style="font-size:12px;color:#4a9eff;font-weight:600">#45554288035</span></td>
            </tr></tbody></table>
          </td></tr>
        <tr>
          <td width="50%" style="padding:16px 20px;border-bottom:1px solid #e8edf5;border-right:1px solid #e8edf5;vertical-align:top;">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#94a3b8;font-weight:600;margin-bottom:4px;">Date</div>
            <div style="font-size:14px;color:#0d2137;font-weight:600;">${formattedDate}</div>
          </td>
          <td width="50%" style="padding:16px 20px;border-bottom:1px solid #e8edf5;vertical-align:top;">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#94a3b8;font-weight:600;margin-bottom:4px;">Time</div>
            <div style="font-size:14px;color:#1a6fff;font-weight:600;">${slotTiming}</div>
          </td>
        </tr>
        <tr>
          <td width="50%" style="padding:16px 20px;border-right:1px solid #e8edf5;vertical-align:top;">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#94a3b8;font-weight:600;margin-bottom:4px;">Customer Email</div>
            <div style="font-size:14px;color:#0d2137;font-weight:600;">${contactEmail}</div>
          </td>
          <td width="50%" style="padding:16px 20px;vertical-align:top;">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#94a3b8;font-weight:600;margin-bottom:4px;">Location</div>
            <div style="font-size:14px;color:#0d2137;font-weight:600;">Online</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- CALENDAR NOTE -->
  <tr>
    <td style="padding:16px 36px 28px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#e8f4ff,#f0f8ff);border:1px solid #c5dfff;border-radius:10px;">
        <tr><td style="padding:14px 18px;">
          <table cellpadding="0" cellspacing="0"><tr>
            <td style="font-size:20px;padding-right:12px;vertical-align:middle;">📅</td>
            <td style="font-size:13px;color:#1a4a80;line-height:1.5;vertical-align:middle;">The calendar invite is attached. Open it to add this appointment to your calendar.</td>
          </tr></table>
        </td></tr>
      </table>
    </td>
  </tr>

  <!-- DIVIDER -->
  <tr><td style="padding:0 36px;"><div style="height:1px;background:#f0f3f7;"></div></td></tr>

  <!-- HELP -->
  <tr>
    <td style="padding:20px 36px;text-align:center;">
      <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.6;">This is an internal notification from the WorldFirst telesales booking system.<br/>For issues, contact your team administrator.</p>
    </td>
  </tr>

  <!-- FOOTER -->
  <tr>
    <td style="background:#f8fafc;border-top:1px solid #e8edf5;padding:24px 36px;">
      <table cellpadding="0" cellspacing="0" style="margin-bottom:10px;"><tr>
        <td style="vertical-align:middle;">
        <img src="https://mdn.marmot-cloud.com/worldfirst/sites/38/2026/04/20260424113953863.svg" width=150 />
        </td>
      </tr></table>
      <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.7;">Internal use only — WorldFirst Telesales Booking System.<br/>© 2026 WorldFirst — Ant International.</p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

function buildCancelHtml({ ticketId, formattedDate, slotTiming }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
</head>

<body style="margin:0;padding:0;background:#f0f4f8;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">

<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:32px 16px;">
  <tr>
    <td align="center">

      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

        <!-- HEADER -->
        <tr>
          <td style="background:#0d2137;padding:24px 36px;">

            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>

                <td style="vertical-align:middle;">
                  <img 
                    src="https://mdn.marmot-cloud.com/worldfirst/sites/38/2026/04/20260424113953863.svg"
                    width="150"
                    alt="WorldFirst"
                    style="display:block;border:0;"
                  />
                </td>

                <td align="right" style="vertical-align:middle;">
                  <span style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#4a9eff;background:rgba(74,158,255,0.12);padding:4px 12px;border-radius:20px;border:1px solid rgba(74,158,255,0.25);">
                    Telesales
                  </span>
                </td>

              </tr>
            </table>

          </td>
        </tr>

        <!-- HERO -->
        <tr>
          <td style="padding:32px 36px 24px;border-bottom:1px solid #f0f3f7;">

            <div style="display:inline-block;padding:5px 12px;border-radius:20px;background:#fce4ec;border:1px solid #f8bbd9;margin-bottom:14px;">
              <span style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#c62828;">
                ● Appointment Cancelled
              </span>
            </div>

            <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#0d2137;line-height:1.3;">
              Your appointment has been cancelled.
            </h1>

            <p style="margin:0;font-size:14px;color:#64748b;line-height:1.6;">
              Your telesales appointment has been successfully cancelled.
              Open the attached file to remove it from your calendar.
            </p>

          </td>
        </tr>

        <!-- APPOINTMENT CARD -->
        <tr>
          <td style="padding:24px 36px 0;">

            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e8edf5;border-radius:12px;overflow:hidden;">

              <!-- CARD HEADER -->
              <tr>

                <td style="background:#0d2137;padding:14px 20px;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td>
                        <span style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#94a9c0;font-weight:600;">
                          Cancelled Appointment
                        </span>
                      </td>
                    </tr>
                  </table>
                </td>

                <td style="background:#0d2137;padding:14px 20px;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td align="left">
                        <span style="font-size:12px;color:#4a9eff;font-weight:600;">
                          #45554288035
                        </span>
                      </td>
                    </tr>
                  </table>
                </td>

              </tr>

              <!-- DATE + TIME -->
              <tr>

                <td width="50%" style="padding:16px 20px;border-bottom:1px solid #e8edf5;border-right:1px solid #e8edf5;vertical-align:top;">
                  <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#94a3b8;font-weight:600;margin-bottom:4px;">
                    Date
                  </div>

                  <div style="font-size:14px;color:#0d2137;font-weight:600;">
                    ${formattedDate}
                  </div>
                </td>

                <td width="50%" style="padding:16px 20px;border-bottom:1px solid #e8edf5;vertical-align:top;">
                  <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#94a3b8;font-weight:600;margin-bottom:4px;">
                    Time
                  </div>

                  <div style="font-size:14px;color:#0d2137;font-weight:600;">
                    ${slotTiming}
                  </div>
                </td>

              </tr>

              <!-- STATUS + ID -->
              <tr>

                <td width="50%" style="padding:16px 20px;border-right:1px solid #e8edf5;vertical-align:top;">
                  <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#94a3b8;font-weight:600;margin-bottom:4px;">
                    Status
                  </div>

                  <div style="font-size:14px;color:#dc2626;font-weight:600;">
                    Cancelled
                  </div>
                </td>

                <td width="50%" style="padding:16px 20px;vertical-align:top;">
                  <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#94a3b8;font-weight:600;margin-bottom:4px;">
                    Appointment ID
                  </div>

                  <div style="font-size:14px;color:#0d2137;font-weight:600;">
                    ${ticketId}
                  </div>
                </td>

              </tr>

            </table>

          </td>
        </tr>

        <!-- CANCEL NOTE -->
        <tr>
          <td style="padding:16px 36px 24px;">

            <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#fff3e0,#fff8ee);border:1px solid #ffcc80;border-radius:10px;">
              <tr>
                <td style="padding:14px 18px;">

                  <table cellpadding="0" cellspacing="0">
                    <tr>

                      <td style="font-size:20px;padding-right:12px;vertical-align:middle;">
                        ⚠️
                      </td>

                      <td style="font-size:13px;color:#e65100;line-height:1.5;vertical-align:middle;">
                        Open the attached <strong>cancel.ics</strong> file to automatically remove this event from your calendar.
                      </td>

                    </tr>
                  </table>

                </td>
              </tr>
            </table>

          </td>
        </tr>

        <!-- DIVIDER -->
        <tr>
          <td style="padding:0 36px;">
            <div style="height:1px;background:#f0f3f7;"></div>
          </td>
        </tr>

        <!-- HELP -->
        <tr>
          <td style="padding:20px 36px;text-align:center;">

            <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.6;">
              Changed your mind?
              <a href="https://www.worldfirst.com/global/help-support/contact-us/" style="color:#1a6fff;text-decoration:none;font-weight:500;">
                Contact us
              </a>
              to book a new appointment.
              <br/>
              We look forward to speaking with you.
            </p>

          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td style="background:#f8fafc;border-top:1px solid #e8edf5;padding:24px 36px;">

            <table cellpadding="0" cellspacing="0" style="margin-bottom:10px;">
              <tr>
                <td style="vertical-align:middle;">

                  <img 
                    src="https://mdn.marmot-cloud.com/worldfirst/sites/38/2026/04/20260424113953863.svg"
                    width="150"
                    alt="WorldFirst"
                    style="display:block;border:0;"
                  />

                </td>
              </tr>
            </table>

            <p style="margin:0 0 8px;font-size:12px;color:#94a3b8;line-height:1.7;">
              This email was sent by the WorldFirst Internal Telesales Team.
              <br/>
              © 2026 WorldFirst — Ant International. All rights reserved.
            </p>

            <table cellpadding="0" cellspacing="0">
              <tr>

                <td style="padding-right:14px;">
                  <a href="https://www.worldfirst.com/global/privacy-policy/" style="font-size:12px;color:#64748b;text-decoration:none;">
                    Privacy Policy
                  </a>
                </td>

                <td style="padding-right:14px;">
                  <a href="https://www.worldfirst.com/global/legal/" style="font-size:12px;color:#64748b;text-decoration:none;">
                    Legal
                  </a>
                </td>

                <td>
                  <a href="https://www.worldfirst.com/global/help-support/contact-us/" style="font-size:12px;color:#64748b;text-decoration:none;">
                    Contact Us
                  </a>
                </td>

              </tr>
            </table>

          </td>
        </tr>

      </table>

    </td>
  </tr>
</table>

</body>
</html>`;
}

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

// ── Find Available Owner (Round Robin) ───────────────────────

async function findAvailableOwner({ currentOwnerId, region, dateKey, slotKey, headers }) {
  const pool   = OWNER_POOL[region] || [];
  const stages = PIPELINE_STAGES[region];

  console.log(`🔄 Round Robin — checking ${pool.length} owners in pool for ${region}`);

  for (const ownerId of pool) {
    if (ownerId === currentOwnerId) continue;

    const res = await axios.post(
      "https://api.hubapi.com/crm/v3/objects/tickets/search",
      {
        filterGroups: [{
          filters: [
            { propertyName: "hubspot_owner_id", operator: "EQ", value: ownerId },
            { propertyName: "hs_pipeline_stage", operator: "EQ", value: stages.SCHEDULED },
          ],
        }],
        properties: ["hs_object_id", "subject"],
        limit: 100,
      },
      { headers }
    );

    const hasConflict = (res?.data?.results || []).some((t) => {
      const p = splitParts(String(t?.properties?.subject || ""));
      return p.length >= 2 && `${p[0]}#${p[1]}` === `${dateKey}#${slotKey}`;
    });

    if (!hasConflict) {
      console.log(`✅ Found available owner: ${ownerId}`);
      return ownerId;
    }

    console.log(`⚠️ Owner ${ownerId} also has conflict — trying next`);
  }

  console.log(`❌ All owners busy for ${dateKey} ${slotKey}`);
  return null;
}

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
    date_key:               dateOfAppointment,
    time_key:               slotTiming,
    current_owner_id:       ownerId,
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
    date_key,
    time_key,
    current_owner_id,
  } = conflictData;

  if (!is_conflicted) return { success: true, reason: "No conflict detected." };

  // ── Contact Conflict → always Out of Slot ────────────────
  if (contact_conflict) {
    await axios.patch(
      `https://api.hubapi.com/crm/v3/objects/tickets/${ticketId}`,
      { properties: { hs_pipeline_stage: stages.OUT_OF_SLOT } },
      { headers }
    );
    await axios.post("https://api.hubapi.com/crm/v3/objects/tasks", {
      properties: {
        hs_task_subject: `[Ticket ${successFlag} Conflicted] Schedule conflicted with another ticket`,
        hs_task_type:    "TODO",
        hs_timestamp:    Date.now(),
        hs_task_status:  "NOT_STARTED",
      },
      associations: [{ to: { id: ticketId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 26 }] }],
    }, { headers });
    await axios.post("https://api.hubapi.com/crm/v3/objects/notes", {
      properties: {
        hs_note_body: [
          `[Conflict ${successFlag}] This customer has been scheduled for the same timing with the owner.`,
          `This ticket moved to out of slot stage because the schedule conflicted with another meeting in the same timing.`,
          ``,
          `Contact conflict count: ${contact_conflict_count} record`,
        ].join("\n"),
        hs_timestamp: Date.now(),
      },
      associations: [{ to: { id: ticketId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 18 }] }],
    }, { headers });
    console.log(`✅ Contact conflict handled for ticketId: ${ticketId}`);
    return { success: true, conflict_type: "contact", action_taken: "Out of Slot, Task & Note created" };
  }

  // ── Owner Conflict → try Round Robin first ───────────────
  if (owner_conflict) {
    const newOwnerId = await findAvailableOwner({
      currentOwnerId: current_owner_id,
      region,
      dateKey: date_key,
      slotKey: time_key,
      headers,
    });

    // Available owner found → reassign ──────────────────────
    if (newOwnerId) {
      await axios.patch(
        `https://api.hubapi.com/crm/v3/objects/tickets/${ticketId}`,
        { properties: { hubspot_owner_id: newOwnerId } },
        { headers }
      );
      await axios.post("https://api.hubapi.com/crm/v3/objects/notes", {
        properties: {
          hs_note_body: [
            `[${successFlag} Reassigned] Owner conflict detected.`,
            `Original owner was busy at this time slot.`,
            `Ticket has been reassigned to a new available owner: ${newOwnerId}`,
          ].join("\n"),
          hs_timestamp: Date.now(),
        },
        associations: [{ to: { id: ticketId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 18 }] }],
      }, { headers });
      console.log(`✅ Owner conflict resolved — reassigned ticket ${ticketId} to owner ${newOwnerId}`);
      return { success: true, conflict_type: "owner", action_taken: "Reassigned to available owner" };
    }

    // All owners busy → Out of Slot ─────────────────────────
    await axios.patch(
      `https://api.hubapi.com/crm/v3/objects/tickets/${ticketId}`,
      { properties: { hs_pipeline_stage: stages.OUT_OF_SLOT } },
      { headers }
    );
    await axios.post("https://api.hubapi.com/crm/v3/objects/tasks", {
      properties: {
        hs_task_subject: `[Ticket ${successFlag} Conflicted] All owners busy — manual assignment needed`,
        hs_task_type:    "TODO",
        hs_timestamp:    Date.now(),
        hs_task_status:  "NOT_STARTED",
      },
      associations: [{ to: { id: ticketId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 26 }] }],
    }, { headers });
    await axios.post("https://api.hubapi.com/crm/v3/objects/notes", {
      properties: {
        hs_note_body: [
          `[Conflict ${successFlag}] Owner conflict detected.`,
          `Round Robin attempted — all ${OWNER_POOL[region]?.length || 0} owners are busy at this time slot.`,
          `This ticket moved to Out of Slot. Manual assignment needed.`,
          ``,
          `Owner conflict count: ${owner_conflict_count} record`,
        ].join("\n"),
        hs_timestamp: Date.now(),
      },
      associations: [{ to: { id: ticketId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 18 }] }],
    }, { headers });
    console.log(`✅ Owner conflict — all owners busy — ticket ${ticketId} moved to Out of Slot`);
    return { success: true, conflict_type: "owner", action_taken: "All owners busy — Out of Slot, Task & Note created" };
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
  const content           = String(props?.content || "").trim();
  const dateOfAppointment = String(props?.date_of_appointment || "").trim();
  const slotTiming        = String(props?.slot_timing || "").trim();

  if (!ownerId) {
    console.log(`⏭️ No owner assigned for ticketId: ${ticketId} — skipping`);
    return { success: false, reason: "No owner assigned yet." };
  }

  const ownerEmail    = await fetchOwnerEmail(ownerId, headers);
  const action        = successFlag === "Rescheduled" ? "reschedule" : "new";
  const formattedDate = formatDateForEmail(dateOfAppointment);

  console.log(`👤 Owner: ${ownerEmail} | Action: ${action} | Date: ${formattedDate}`);

  const assocRes = await axios.get(
    `https://api.hubapi.com/crm/v3/objects/tickets/${ticketId}/associations/contacts`,
    { headers }
  );

  const contactId      = assocRes?.data?.results?.[0]?.id || "";
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
  await axios.post("https://api.hubapi.com/crm/v3/objects/notes", {
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
  }, { headers });
  console.log(`✅ Note created for ticketId: ${ticketId}`);

  // ── Build URLs ───────────────────────────────────────────
  const cancelUrl = `https://campaign.worldfirst.com/${region.toLowerCase()}-cancellation-appointment` +
    `?title=${encodeURIComponent(content)}` +
    `&date=${encodeURIComponent(formattedDate)}` +
    `&time=${encodeURIComponent(slotTiming)}` +
    `&id=${ticketId}&ticket_id=${ticketId}` +
    `&email=${encodeURIComponent(contactEmail)}` +
    `&region=${encodeURIComponent(region)}` +
    `&uid=${encodeURIComponent(`hs-${ticketId}@woven.sg`)}`;

  const rescheduleUrl = `https://campaign.worldfirst.com/${region.toLowerCase()}-rescheduling-appointment-page` +
    `?title=${encodeURIComponent(content)}` +
    `&date=${encodeURIComponent(formattedDate)}` +
    `&time=${encodeURIComponent(slotTiming)}` +
    `&id=${ticketId}&ticket_id=${ticketId}` +
    `&email=${encodeURIComponent(contactEmail)}` +
    `&region=${encodeURIComponent(region)}`;

  // ── Build Email HTML ─────────────────────────────────────
  const customerHtml = buildCustomerHtml({ ticketId, formattedDate, slotTiming, successFlag, rescheduleUrl, cancelUrl });
  const ownerHtml    = buildOwnerHtml({ ticketId, formattedDate, slotTiming, contactEmail, successFlag });

  // ── 3) Send Customer ICS Email ───────────────────────────
  if (contactEmail) {
    try {
      await axios.post(SERVERLESS_URL, {
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
        action,
        timezoneOffsetHours,
        html:                customerHtml,
      }, { headers: { "Content-Type": "application/json" }, timeout: 20000 });
      console.log(`✅ Customer ICS email sent`);
    } catch (err) {
      console.error(`⚠️ Customer ICS email failed:`, err.response?.data || err.message);
    }
  }

  // ── 4) Send Owner ICS Email ──────────────────────────────
  if (ownerEmail) {
    try {
      await axios.post(SERVERLESS_URL, {
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
        action,
        timezoneOffsetHours,
        html:                ownerHtml,
      }, { headers: { "Content-Type": "application/json" }, timeout: 20000 });
      console.log(`✅ Owner ICS email sent`);
    } catch (err) {
      console.error(`⚠️ Owner ICS email failed:`, err.response?.data || err.message);
    }
  }

  return { success: true, owner: ownerEmail, region_used: region, action };
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

  await axios.post("https://api.hubapi.com/crm/v3/objects/notes", {
    properties: {
      hs_note_body: "[Rescheduled] Customer rescheduled this ticket.",
      hs_timestamp: Date.now(),
    },
    associations: [{ to: { id: ticketId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 18 }] }],
  }, { headers });

  console.log(`✅ Reschedule submission complete — ticketId: ${ticketId}`);
  return { status: "updated", ticket_id: ticketId, date_ms: dateMs, time_text: timeText, region_used: region };
}

// ── Cancel Submission ────────────────────────────────────────

async function handleCancelSubmission({ contactId, ticketId, headers }) {
  if (!ticketId) throw new Error("request_cancel_ticket_id is empty.");

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
  const ownerEmail          = ownerId ? await fetchOwnerEmail(ownerId, headers) : "";

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
  await axios.post("https://api.hubapi.com/crm/v3/objects/notes", {
    properties: {
      hs_note_body: "[Cancel] Customer cancelled this request.",
      hs_timestamp: Date.now(),
    },
    associations: [{ to: { id: ticketId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 18 }] }],
  }, { headers });
  console.log(`✅ Cancel note created for ticketId: ${ticketId}`);

  // ── Build Cancel HTML ────────────────────────────────────
  const cancelHtml = buildCancelHtml({ ticketId, formattedDate, slotTiming });

  // ── 3) Send Cancel ICS Email to Customer ─────────────────
  if (contactEmail) {
    try {
      await axios.post(SERVERLESS_URL, {
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
        timezoneOffsetHours,
        html:                cancelHtml,
      }, { headers: { "Content-Type": "application/json" }, timeout: 20000 });
      console.log(`✅ Customer cancel ICS email sent`);
    } catch (err) {
      console.error(`⚠️ Customer cancel ICS email failed:`, err.response?.data || err.message);
    }
  }

  // ── 4) Send Cancel ICS Email to Owner ────────────────────
  if (ownerEmail) {
    try {
      await axios.post(SERVERLESS_URL, {
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
        timezoneOffsetHours,
        html:                cancelHtml,
      }, { headers: { "Content-Type": "application/json" }, timeout: 20000 });
      console.log(`✅ Owner cancel ICS email sent`);
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

      // ── TICKET: Owner Assigned ────────────────────────────
      if (eventType === "ticket.propertyChange" && propertyName === "hubspot_owner_id" && newValue) {
        const ticketProps  = await fetchTicketProps(objectId, headers);
        const region       = String(ticketProps?.region || "").trim().toUpperCase();
        const currentStage = String(ticketProps?.hs_pipeline_stage || "").trim();
        if (!PIPELINE_STAGES[region]) { console.log(`⏭️ Unsupported region ${region}`); continue; }
        if (isSkippableStage(region, currentStage)) { console.log(`⏭️ Skipping ${objectId} — ${currentStage}`); continue; }
        console.log(`🎯 Owner assigned for ticket ${objectId} (${region})`);
        await runAllocationFlow({ ticketId: objectId, region, headers });
        continue;
      }

      // ── TICKET: Slot Timing ───────────────────────────────
      if (eventType === "ticket.propertyChange" && propertyName === "slot_timing" && newValue) {
        const ticketProps  = await fetchTicketProps(objectId, headers);
        const region       = String(ticketProps?.region || "").trim().toUpperCase();
        const currentStage = String(ticketProps?.hs_pipeline_stage || "").trim();
        const ownerId      = String(ticketProps?.hubspot_owner_id || "").trim();
        if (!PIPELINE_STAGES[region]) { console.log(`⏭️ Unsupported region ${region}`); continue; }
        if (isSkippableStage(region, currentStage)) { console.log(`⏭️ Skipping ${objectId} — ${currentStage}`); continue; }
        if (!ownerId) { console.log(`⏭️ No owner yet for ${objectId}`); continue; }
        console.log(`🎯 Slot timing changed for ticket ${objectId} (${region})`);
        await runAllocationFlow({ ticketId: objectId, region, headers });
        continue;
      }

      // ── TICKET: Date of Appointment ───────────────────────
      if (eventType === "ticket.propertyChange" && propertyName === "date_of_appointment" && newValue) {
        const ticketProps  = await fetchTicketProps(objectId, headers);
        const region       = String(ticketProps?.region || "").trim().toUpperCase();
        const currentStage = String(ticketProps?.hs_pipeline_stage || "").trim();
        const ownerId      = String(ticketProps?.hubspot_owner_id || "").trim();
        if (!PIPELINE_STAGES[region]) { console.log(`⏭️ Unsupported region ${region}`); continue; }
        if (isSkippableStage(region, currentStage)) { console.log(`⏭️ Skipping ${objectId} — ${currentStage}`); continue; }
        if (!ownerId) { console.log(`⏭️ No owner yet for ${objectId}`); continue; }
        console.log(`🎯 Date changed for ticket ${objectId} (${region})`);
        await runAllocationFlow({ ticketId: objectId, region, headers });
        continue;
      }

      // ── CONTACT: Reschedule Payload ───────────────────────
      if (eventType === "contact.propertyChange" && propertyName === "request_reschedule_payload" && newValue) {
        console.log(`🎯 Reschedule payload for contact ${objectId}`);
        const result = await handleRescheduleSubmission({ contactId: objectId, payload: newValue, headers });
        console.log(`✅ Reschedule Submission:`, result);
        continue;
      }

      // ── CONTACT: Cancel Ticket ID ─────────────────────────
      if (eventType === "contact.propertyChange" && propertyName === "request_cancel_ticket_id" && newValue) {
        console.log(`🎯 Cancel request for contact ${objectId}`);
        const result = await handleCancelSubmission({ contactId: objectId, ticketId: newValue, headers });
        console.log(`✅ Cancel Submission:`, result);
        continue;
      }

      console.log(`⏭️ No handler matched for event: ${eventType} | ${propertyName}`);

    } catch (err) {
      console.error(`🔥 Error processing event [${eventType}|${propertyName}|${objectId}]:`, err.message);
    }
  }

  return { statusCode: 200, body: { status: "processed" } };
};
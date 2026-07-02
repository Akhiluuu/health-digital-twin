// services/emailService.ts
// Sends transactional emails using Resend (resend.com)
// Free tier: 3000 emails/month
//
// SETUP:
//   1. npm install axios
//   2. Sign up at resend.com
//   3. Go to API Keys → Create API Key → paste below
//   4. For testing use from: "onboarding@resend.dev"

import axios from "axios";

import { log } from "../utils/logger";

const RESEND_API_KEY =
  process.env.EXPO_PUBLIC_RESEND_API_KEY ||
  "re_WQFism5R_E6eSbt2sAvG7HojgDiQbnrN7";
const FROM_EMAIL     = "VitalTwin <onboarding@resend.dev>";

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  try {
    await axios.post(    
      "https://api.resend.com/emails",
      { from: FROM_EMAIL, to, subject, html },
      {
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );
    log("✅ Email sent to:", to);
  } catch (error: any) {
    log("⚠️ Email failed:", error?.response?.data || error.message);
  }
}

// ── Welcome Email ─────────────────────────────────────────────────
export async function sendWelcomeEmail(name: string, email: string): Promise<void> {
  await sendEmail(
    email,
    `Welcome to VitalTwin, ${name}! 🎉`,
    `<!DOCTYPE html>
    <html>
      <body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr><td align="center" style="padding:40px 20px;">
            <table width="520" cellpadding="0" cellspacing="0"
              style="background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
              <tr>
                <td style="background:linear-gradient(135deg,#2563eb,#7c3aed);padding:40px;text-align:center;">
                  <div style="font-size:48px;margin-bottom:12px;">💙</div>
                  <h1 style="color:#fff;margin:0;font-size:28px;font-weight:800;">Welcome to VitalTwin!</h1>
                  <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:15px;">Your health journey starts now</p>
                </td>
              </tr>
              <tr>
                <td style="padding:36px 40px;">
                  <p style="color:#020617;font-size:16px;margin:0 0 16px;">Hi <strong>${name}</strong> 👋</p>
                  <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 24px;">
                    Your VitalTwin account has been created successfully.
                    We're excited to help you track and improve your health every day.
                  </p>
                  <table width="100%" cellpadding="12" style="background:#f0f9ff;border-radius:14px;margin-bottom:24px;">
                    <tr><td style="color:#0f172a;font-size:14px;">📊 &nbsp;Track your vitals in real time</td></tr>
                    <tr><td style="color:#0f172a;font-size:14px;">💊 &nbsp;Never miss a medication</td></tr>
                    <tr><td style="color:#0f172a;font-size:14px;">👨‍👩‍👧 &nbsp;Monitor your family's health</td></tr>
                  </table>
                  <table width="100%" cellpadding="0" style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;margin-bottom:24px;">
                    <tr style="background:#f8fafc;">
                      <td style="padding:12px 16px;color:#64748b;font-size:13px;">Name</td>
                      <td style="padding:12px 16px;color:#0f172a;font-size:13px;font-weight:600;">${name}</td>
                    </tr>
                    <tr>
                      <td style="padding:12px 16px;color:#64748b;font-size:13px;">Email</td>
                      <td style="padding:12px 16px;color:#0f172a;font-size:13px;font-weight:600;">${email}</td>
                    </tr>
                  </table>
                  <p style="color:#94a3b8;font-size:13px;text-align:center;margin:0;">
                    If you didn't create this account, please ignore this email.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="background:#f8fafc;padding:20px 40px;text-align:center;border-top:1px solid #e2e8f0;">
                  <p style="color:#94a3b8;font-size:12px;margin:0;">© 2025 VitalTwin · All rights reserved</p>
                </td>
              </tr>
            </table>
          </td></tr>
        </table>
      </body>
    </html>`
  );
}

// ── Login Notification Email ──────────────────────────────────────
export async function sendLoginEmail(name: string, email: string): Promise<void> {
  const time = new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

  await sendEmail(
    email,
    `New login to your VitalTwin account 🔐`,
    `<!DOCTYPE html>
    <html>
      <body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr><td align="center" style="padding:40px 20px;">
            <table width="520" cellpadding="0" cellspacing="0"
              style="background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
              <tr>
                <td style="background:linear-gradient(135deg,#0f172a,#1e3a5f);padding:40px;text-align:center;">
                  <div style="font-size:48px;margin-bottom:12px;">🔐</div>
                  <h1 style="color:#fff;margin:0;font-size:26px;font-weight:800;">New Login Detected</h1>
                  <p style="color:rgba(255,255,255,0.75);margin:8px 0 0;font-size:14px;">Someone just logged into your VitalTwin account</p>
                </td>
              </tr>
              <tr>
                <td style="padding:36px 40px;">
                  <p style="color:#020617;font-size:16px;margin:0 0 16px;">Hi <strong>${name}</strong>,</p>
                  <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 24px;">
                    We noticed a new login to your VitalTwin account. Here are the details:
                  </p>
                  <table width="100%" cellpadding="0" style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin-bottom:24px;">
                    <tr style="background:#f8fafc;">
                      <td style="padding:14px 16px;color:#64748b;font-size:13px;">Account</td>
                      <td style="padding:14px 16px;color:#0f172a;font-size:13px;font-weight:600;">${email}</td>
                    </tr>
                    <tr>
                      <td style="padding:14px 16px;color:#64748b;font-size:13px;">Time</td>
                      <td style="padding:14px 16px;color:#0f172a;font-size:13px;font-weight:600;">${time}</td>
                    </tr>
                    <tr style="background:#f8fafc;">
                      <td style="padding:14px 16px;color:#64748b;font-size:13px;">App</td>
                      <td style="padding:14px 16px;color:#0f172a;font-size:13px;font-weight:600;">VitalTwin Mobile</td>
                    </tr>
                  </table>
                  <table width="100%" cellpadding="16"
                    style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;margin-bottom:24px;">
                    <tr>
                      <td style="color:#92400e;font-size:13px;line-height:1.6;">
                        ⚠️ <strong>Wasn't you?</strong> If you did not perform this login,
                        please change your password immediately and contact support.
                      </td>
                    </tr>
                  </table>
                  <p style="color:#94a3b8;font-size:13px;text-align:center;margin:0;">
                    This is an automated security notification from VitalTwin.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="background:#f8fafc;padding:20px 40px;text-align:center;border-top:1px solid #e2e8f0;">
                  <p style="color:#94a3b8;font-size:12px;margin:0;">© 2025 VitalTwin · All rights reserved</p>
                </td>
              </tr>
            </table>
          </td></tr>
        </table>
      </body>
    </html>`
  );
}
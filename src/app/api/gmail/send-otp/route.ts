import { NextRequest, NextResponse } from "next/server";
import { securityDB } from "@/backend/database.ts";

export const runtime = "nodejs";

function encodeBase64Url(input: string): string {
  return Buffer.from(input, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return NextResponse.json(
      {
        error: "Missing or invalid Google OAuth Authorization Bearer token.",
        detail: "Please sign in with Google to send OTP emails via Gmail.",
      },
      { status: 401 }
    );
  }

  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json(
        { error: "Request body must be a JSON object." },
        { status: 400 }
      );
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: "Invalid or empty JSON request body." },
      { status: 400 }
    );
  }

  const rawRecipients = body.recipients ?? body.to ?? "";
  const recipientsList = (
    Array.isArray(rawRecipients)
      ? rawRecipients.map((r) => String(r).trim())
      : String(rawRecipients)
          .split(/[,\s;]+/)
          .map((r) => r.trim())
  ).filter(Boolean);

  const validRecipients = recipientsList.filter(isValidEmail);
  if (validRecipients.length === 0) {
    return NextResponse.json(
      { error: "Please provide at least one valid recipient Gmail address." },
      { status: 400 }
    );
  }

  const roomCode = String(body.roomCode ?? body.otpCode ?? "").trim();
  if (!roomCode) {
    return NextResponse.json(
      { error: "A 6-digit OTP / Room Code is required." },
      { status: 400 }
    );
  }

  const lobbyTitle = String(
    body.lobbyTitle ?? "Collaborative Governance Review Lobby"
  ).trim();
  const senderName = String(body.senderName ?? "BrandLens Admin").trim();
  const senderEmail = String(body.senderEmail ?? "").trim();
  const otpType =
    body.otpType === "step_up_otp" ? "step_up_otp" : "lobby_pin";

  const subject =
    otpType === "step_up_otp"
      ? `[BrandLens AI] Your 6-Digit Step-Up Verification OTP: ${roomCode}`
      : `[BrandLens AI] Your 6-Digit Review Lobby OTP Code for "${lobbyTitle}"`;

  const htmlBody = `
<!DOCTYPE html>
<html>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc; padding: 24px; color: #0f172a;">
    <div style="max-width: 540px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(15, 23, 42, 0.05);">
      <div style="background: #0f172a; color: #ffffff; padding: 20px 24px;">
        <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.14em; color: #5eead4; font-weight: 700;">
          BrandLens AI · Governance &amp; Compliance Lobby
        </div>
        <h2 style="margin: 6px 0 0; font-size: 18px; font-weight: 700;">
          ${
            otpType === "step_up_otp"
              ? "Step-Up 6-Digit Session OTP"
              : "6-Digit Collaborative Review Lobby Invitation"
          }
        </h2>
      </div>
      <div style="padding: 24px;">
        <p style="margin: 0 0 14px; font-size: 14px; line-height: 1.6; color: #334155;">
          ${
            otpType === "step_up_otp"
              ? `A 6-digit verification OTP was requested by <strong>${senderName}</strong>${senderEmail ? ` (${senderEmail})` : ""} for session verification.`
              : `<strong>${senderName}</strong>${senderEmail ? ` (${senderEmail})` : ""} created the collaborative compliance lobby <strong>"${lobbyTitle}"</strong> and shared the confidential 6-digit OTP code with you.`
          }
        </p>

        <div style="background: #f1f5f9; border: 1px dashed #94a3b8; border-radius: 12px; padding: 18px; text-align: center; margin: 20px 0;">
          <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; color: #64748b;">
            ${otpType === "step_up_otp" ? "6-Digit Verification OTP" : "Confidential 6-Digit Lobby OTP / PIN"}
          </div>
          <div style="margin-top: 8px; font-family: 'Courier New', monospace; font-size: 30px; font-weight: 800; letter-spacing: 0.25em; color: #0f172a;">
            ${roomCode}
          </div>
        </div>

        <p style="margin: 0 0 12px; font-size: 13px; line-height: 1.5; color: #475569;">
          ${
            otpType === "step_up_otp"
              ? "Enter this 6-digit OTP in the Step-Up Verification bar inside BrandLens AI to elevate your session."
              : "Open the Collaborative Review Lobby in BrandLens AI and enter this 6-digit code in the 'Enter Room PIN / Code' box to join the live session."
          }
        </p>

        <div style="border-top: 1px solid #e2e8f0; margin-top: 20px; padding-top: 14px; font-size: 11px; color: #94a3b8;">
          Sent with user permission via Gmail API · BrandLens AI Governance Audit Trail
        </div>
      </div>
    </div>
  </body>
</html>`.trim();

  const rawMime = [
    `To: ${validRecipients.join(", ")}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject, "utf-8").toString("base64")}?=`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "",
    htmlBody,
  ].join("\r\n");

  const encodedMessage = encodeBase64Url(rawMime);

  try {
    const gmailRes = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw: encodedMessage }),
      }
    );

    const gmailData = await gmailRes.json().catch(() => ({}));

    if (!gmailRes.ok) {
      const errMessage =
        gmailData?.error?.message ||
        `Gmail API returned HTTP ${gmailRes.status}`;
      return NextResponse.json(
        {
          error: errMessage,
          detail: errMessage,
          status: gmailRes.status,
        },
        { status: gmailRes.status }
      );
    }

    securityDB.logAudit({
      brand_id: "b0000001-0000-4000-8000-000000000001",
      user_id: null,
      user_email: senderEmail || undefined,
      action: "GMAIL_OTP_SENT",
      details: {
        recipients: validRecipients,
        lobby_title: lobbyTitle,
        otp_type: otpType,
        gmail_message_id: gmailData.id,
      },
    });

    return NextResponse.json({
      ok: true,
      messageId: gmailData.id,
      threadId: gmailData.threadId,
      recipients: validRecipients,
      message: `6-digit OTP emailed via Gmail to ${validRecipients.join(", ")}.`,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to call Gmail API.";
    return NextResponse.json(
      { error: message, detail: message },
      { status: 500 }
    );
  }
}

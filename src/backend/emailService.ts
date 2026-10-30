import net from 'net';
import tls from 'tls';

const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_USER = process.env.SMTP_USER || 'shriy9190@gmail.com';
const SMTP_PASSWORD = process.env.SMTP_PASSWORD || 'your_16_digit_app_password';
const FROM_EMAIL = process.env.FROM_EMAIL || 'shriy9190@gmail.com';

export function buildOtpEmailHtml(pinCode: string, brandName: string = 'BrandLens AI'): {
  subject: string;
  htmlContent: string;
} {
  const subject = `Your Access PIN for ${brandName}`;
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 500px; margin: auto; padding: 24px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #1a1a1a; margin-bottom: 8px;">${brandName}</h2>
        <p style="color: #555; font-size: 15px;">Use the one-time access code below to verify your workspace access:</p>
        <div style="background-color: #f4f6f8; padding: 18px; text-align: center; border-radius: 6px; margin: 24px 0;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #111;">${pinCode}</span>
        </div>
        <p style="color: #777; font-size: 13px;">This code is single-use and will expire in <strong>15 minutes</strong>.</p>
        <p style="color: #999; font-size: 12px; margin-top: 24px; border-top: 1px solid #eee; padding-top: 12px;">
            If you did not request this code, you can safely ignore this email.
        </p>
    </div>
  `.trim();

  return { subject, htmlContent };
}

function encodeBase64Url(input: string): string {
  return Buffer.from(input, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export interface SendOtpEmailOptions {
  googleAccessToken?: string | null;
  senderName?: string;
  senderEmail?: string;
}

export interface SendOtpEmailResult {
  delivered: boolean;
  mode: 'gmail_api' | 'smtp' | 'local_backup';
  from: string;
  messageId?: string;
  error?: string;
}

export async function sendOtpEmail(
  recipientEmail: string,
  pinCode: string,
  brandName: string = 'BrandLens AI',
  options?: SendOtpEmailOptions
): Promise<SendOtpEmailResult> {
  const { subject, htmlContent } = buildOtpEmailHtml(pinCode, brandName);
  let lastError: string | undefined;

  // 1. Primary: If a Google OAuth access token is provided, deliver directly via Gmail API
  const googleToken = options?.googleAccessToken?.trim();
  if (googleToken) {
    try {
      const rawMime = [
        `To: ${recipientEmail}`,
        `Subject: =?UTF-8?B?${Buffer.from(subject, 'utf-8').toString('base64')}?=`,
        'MIME-Version: 1.0',
        'Content-Type: text/html; charset="UTF-8"',
        '',
        htmlContent,
      ].join('\r\n');

      const encodedMessage = encodeBase64Url(rawMime);
      const gmailRes = await fetch(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${googleToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ raw: encodedMessage }),
        }
      );

      const gmailData = await gmailRes.json().catch(() => ({}));
      if (gmailRes.ok) {
        console.log(
          `[Email Service]: Successfully delivered 15-min OTP to ${recipientEmail} via Gmail API`
        );
        return {
          delivered: true,
          mode: 'gmail_api',
          from: options?.senderEmail || FROM_EMAIL,
          messageId: gmailData?.id,
        };
      } else {
        lastError =
          gmailData?.error?.message ||
          `Gmail API returned HTTP ${gmailRes.status}`;
        console.warn(`[Email Service]: Gmail API send failed: ${lastError}`);
      }
    } catch (err: any) {
      lastError = err?.message || 'Gmail API network error';
      console.warn(`[Email Service]: Gmail API error: ${lastError}`);
    }
  }

  // 2. Secondary: Deliver via SMTP STARTTLS if real SMTP credentials are configured
  if (SMTP_PASSWORD && SMTP_PASSWORD !== 'your_16_digit_app_password') {
    try {
      await sendViaSmtpStartTls({
        host: SMTP_HOST,
        port: SMTP_PORT,
        user: SMTP_USER,
        pass: SMTP_PASSWORD,
        from: `${brandName} <${FROM_EMAIL}>`,
        fromAddress: FROM_EMAIL,
        to: recipientEmail,
        subject,
        html: htmlContent,
      });
      console.log(
        `[Email Service]: Successfully sent OTP to ${recipientEmail} via SMTP (${FROM_EMAIL})`
      );
      return { delivered: true, mode: 'smtp', from: FROM_EMAIL };
    } catch (exc: any) {
      lastError = exc?.message || String(exc);
      console.warn(`[Email Service Warning]: Could not deliver via SMTP (${lastError})`);
    }
  }

  return {
    delivered: false,
    mode: 'local_backup',
    from: FROM_EMAIL,
    error:
      lastError ||
      'Email could not be delivered because neither Google Gmail OAuth nor SMTP_PASSWORD is active.',
  };
}

async function sendViaSmtpStartTls(params: {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  fromAddress: string;
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: params.host, port: params.port });
    socket.setTimeout(8000);

    let settled = false;
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(err);
    };

    socket.on('timeout', () => fail(new Error('SMTP connection timed out')));
    socket.on('error', (err) => fail(err));

    socket.once('data', () => {
      socket.write(`EHLO brandlens.local\r\n`);
      socket.once('data', () => {
        socket.write(`STARTTLS\r\n`);
        socket.once('data', (tlsResp) => {
          if (!tlsResp.toString().startsWith('220')) {
            return fail(new Error(`STARTTLS failed: ${tlsResp.toString().trim()}`));
          }
          const tlsSocket = tls.connect({ socket, servername: params.host }, () => {
            const steps = [
              `EHLO brandlens.local`,
              `AUTH LOGIN`,
              Buffer.from(params.user).toString('base64'),
              Buffer.from(params.pass).toString('base64'),
              `MAIL FROM:<${params.fromAddress}>`,
              `RCPT TO:<${params.to}>`,
              `DATA`,
              [
                `From: ${params.from}`,
                `To: ${params.to}`,
                `Subject: ${params.subject}`,
                `MIME-Version: 1.0`,
                `Content-Type: text/html; charset="UTF-8"`,
                ``,
                params.html,
                `.`,
              ].join('\r\n'),
              `QUIT`,
            ];

            let idx = 0;
            const nextStep = () => {
              if (idx >= steps.length) {
                if (!settled) {
                  settled = true;
                  tlsSocket.end();
                  resolve();
                }
                return;
              }
              const cmd = steps[idx++];
              tlsSocket.write(`${cmd}\r\n`);
            };

            tlsSocket.on('data', (chunk) => {
              const str = chunk.toString();
              if (/^[45]\d\d/.test(str)) {
                return fail(new Error(str.trim()));
              }
              nextStep();
            });

            nextStep();
          });
          tlsSocket.on('error', (err) => fail(err));
        });
      });
    });
  });
}

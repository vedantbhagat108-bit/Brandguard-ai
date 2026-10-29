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

export async function sendOtpEmail(
  recipientEmail: string,
  pinCode: string,
  brandName: string = 'BrandLens AI'
): Promise<{ delivered: boolean; mode: 'smtp' | 'local_backup'; from: string }> {
  const { subject, htmlContent } = buildOtpEmailHtml(pinCode, brandName);

  // If default placeholder app password is set or no real SMTP credentials configured, log to local backup immediately
  if (!SMTP_PASSWORD || SMTP_PASSWORD === 'your_16_digit_app_password') {
    console.log(
      `[Email Service Warning]: Could not deliver via SMTP (SMTP_PASSWORD not configured for ${SMTP_HOST}:${SMTP_PORT})`
    );
    console.log(`[LOCAL BACKUP]: OTP for ${recipientEmail} is -> ${pinCode}`);
    return { delivered: false, mode: 'local_backup', from: FROM_EMAIL };
  }

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
    console.log(`[Email Service]: Successfully sent OTP to ${recipientEmail} via ${FROM_EMAIL}`);
    return { delivered: true, mode: 'smtp', from: FROM_EMAIL };
  } catch (exc: any) {
    console.log(`[Email Service Warning]: Could not deliver via SMTP (${exc?.message || exc})`);
    console.log(`[LOCAL BACKUP]: OTP for ${recipientEmail} is -> ${pinCode}`);
    return { delivered: false, mode: 'local_backup', from: FROM_EMAIL };
  }
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

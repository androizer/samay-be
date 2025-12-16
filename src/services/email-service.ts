import { ServerClient } from "postmark";

const POSTMARK_API_TOKEN = process.env.POSTMARK_API_TOKEN;
const POSTMARK_FROM_EMAIL = process.env.POSTMARK_FROM_EMAIL || "noreply@example.com";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

// Initialize Postmark client
const postmarkClient = POSTMARK_API_TOKEN
  ? new ServerClient(POSTMARK_API_TOKEN)
  : null;

/**
 * Send verification email to user
 */
export async function sendVerificationEmail(
  userEmail: string,
  userName: string,
  token: string
): Promise<void> {
  if (!postmarkClient) {
    throw new Error("Postmark API token is not configured");
  }

  const verificationLink = `${FRONTEND_URL}/verify-email?token=${token}`;

  const htmlBody = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verify Your Email</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #f4f4f4; padding: 20px; border-radius: 5px;">
          <h1 style="color: #333; margin-top: 0;">Verify Your Email Address</h1>
          <p>Hi ${userName},</p>
          <p>Thank you for registering! Please verify your email address by clicking the button below:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${verificationLink}" 
               style="background-color: #007bff; color: #ffffff; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
              Verify Email Address
            </a>
          </div>
          <p>Or copy and paste this link into your browser:</p>
          <p style="word-break: break-all; color: #007bff;">${verificationLink}</p>
          <p style="color: #666; font-size: 12px; margin-top: 30px;">
            This link will expire in 24 hours. If you didn't create an account, please ignore this email.
          </p>
        </div>
      </body>
    </html>
  `;

  const textBody = `
    Hi ${userName},

    Thank you for registering! Please verify your email address by visiting the following link:

    ${verificationLink}

    This link will expire in 24 hours. If you didn't create an account, please ignore this email.
  `;

  try {
    await postmarkClient.sendEmail({
      From: POSTMARK_FROM_EMAIL,
      To: userEmail,
      Subject: "Verify Your Email Address",
      HtmlBody: htmlBody,
      TextBody: textBody,
      MessageStream: "outbound",
    });
  } catch (error) {
    console.error("Error sending verification email:", error);
    throw new Error("Failed to send verification email");
  }
}


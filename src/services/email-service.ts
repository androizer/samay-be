import { ServerClient } from "postmark";

const POSTMARK_API_TOKEN = process.env.POSTMARK_API_TOKEN;
const POSTMARK_FROM_EMAIL =
  process.env.POSTMARK_FROM_EMAIL || "noreply@example.com";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
const TEMPLATE_ALIAS = process.env.POSTMARK_TEMPLATE_ALIAS || "samay-verify-email";
const COMPANY_NAME = process.env.COMPANY_NAME || "Proximity Works";
const COMPANY_ADDRESS =
  process.env.COMPANY_ADDRESS ||
  "HD-496, WeWork Enam Sambhav, Bandra Kurla Complex, Bandra East, Mumbai, Maharashtra 400051";

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
  token: string,
): Promise<void> {
  if (!postmarkClient) {
    throw new Error("Postmark API token is not configured");
  }

  const verificationLink = `${FRONTEND_URL}/verify-email?token=${token}`;

  try {
    await postmarkClient.sendEmailWithTemplate({
      From: POSTMARK_FROM_EMAIL,
      To: userEmail,
      MessageStream: "outbound",
      TemplateAlias: TEMPLATE_ALIAS,
      TemplateModel: {
        product_url: FRONTEND_URL,
        product_name: "Samay",
        user_name: userName,
        verification_link: verificationLink,
        company_name: COMPANY_NAME,
        company_address: COMPANY_ADDRESS,
      },
    });
  } catch (error) {
    console.error("Error sending verification email:", error);
    throw new Error("Failed to send verification email");
  }
}

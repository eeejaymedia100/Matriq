// Matriq — Resend integration test script
// Run inside the backend container: node /tmp/test-email.js
const { Resend } = require('resend');

const apiKey = process.env.RESEND_API_KEY;
if (!apiKey) {
  console.error('FAIL: RESEND_API_KEY not set in environment');
  process.exit(1);
}

const resend = new Resend(apiKey);

async function main() {
  try {
    const result = await resend.emails.send({
      from: 'Matriq <onboarding@resend.dev>',
      to: ['juliusemmanueloghenegare@gmail.com'],
      subject: 'Matriq — Email Integration Test',
      html: `<div style="font-family: sans-serif; max-width: 480px;">
        <h2 style="color: #0D0620;">Matriq Email Service</h2>
        <p>This is a test email from the Matriq backend. If you are reading this, the Resend integration is configured correctly and sending real email.</p>
        <hr style="border: none; border-top: 1px solid #E8E0F0;" />
        <p style="font-size: 12px; color: #8B7AAE;">Sent at ${new Date().toISOString()} · Matriq Phase 0 infrastructure verification</p>
      </div>`,
    });

    if (result.error) {
      console.error('FAIL:', JSON.stringify(result.error, null, 2));
      process.exit(1);
    }

    console.log('SUCCESS: Email sent!');
    console.log('Message ID:', result.data?.id);
  } catch (err) {
    console.error('EXCEPTION:', err.message);
    process.exit(1);
  }
}

main();

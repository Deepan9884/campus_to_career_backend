/**
 * Email Service Test Script
 * Tests Resend and Brevo API integrations
 * 
 * Usage: node test-email.js
 */

require('dotenv').config();
const env = require('./src/config/env');

// Test email recipient - IMPORTANT: For Resend free tier, use the email you signed up with
// If you see a 403 error, change this to YOUR Resend account email
const TEST_EMAIL = process.env.RESEND_TEST_EMAIL || process.env.SMTP_USER || 'campustocareer25@gmail.com';

console.log('\n🔍 Email Configuration Check:');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('SMTP_USER:', env.SMTP_USER ? '✓ Set' : '✗ Not set');
console.log('SMTP_PASS:', env.SMTP_PASS ? '✓ Set' : '✗ Not set');
console.log('RESEND_API_KEY:', env.RESEND_API_KEY ? '✓ Set' : '✗ Not set');
console.log('BREVO_API_KEY:', env.BREVO_API_KEY ? '✓ Set' : '✗ Not set');
console.log('TEST_EMAIL:', TEST_EMAIL);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

if (env.RESEND_API_KEY) {
  console.log('ℹ️  Resend Free Tier Note:');
  console.log('   Test emails can only be sent to the email you signed up with.');
  console.log('   If you see a 403 error, set RESEND_TEST_EMAIL in .env to your Resend account email.\n');
}

async function testResend() {
  if (!env.RESEND_API_KEY) {
    console.log('⚠️  Skipping Resend test - API key not configured\n');
    return false;
  }

  console.log('📧 Testing Resend API...');
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Campus to Career AI <onboarding@resend.dev>',
        reply_to: env.SMTP_USER || 'campustocareer25@gmail.com',
        to: [TEST_EMAIL],
        subject: '✅ Resend Test - Campus to Career AI',
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <title>Test Email</title>
            </head>
            <body style="font-family: Arial, sans-serif; padding: 20px; background-color: #f5f5f5;">
              <div style="max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px;">
                <h1 style="color: #4f46e5;">✅ Resend API Test Successful!</h1>
                <p>This email was successfully sent via <strong>Resend API</strong>.</p>
                <p style="color: #666; font-size: 14px;">
                  If you're reading this, it means your Resend integration is working correctly!
                </p>
                <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 20px 0;">
                <p style="color: #999; font-size: 12px;">
                  Campus to Career AI - Email Service Test<br>
                  ${new Date().toLocaleString()}
                </p>
              </div>
            </body>
          </html>
        `,
        text: 'Resend API Test Successful! This email was sent via Resend.',
      }),
    });

    const data = await response.json();
    
    if (response.ok) {
      console.log('✅ Resend API: SUCCESS');
      console.log('   Email ID:', data.id);
      console.log('   Sent to:', TEST_EMAIL);
      console.log('   Status: Delivered\n');
      return true;
    } else {
      console.error('❌ Resend API: FAILED');
      console.error('   Status:', response.status);
      console.error('   Error:', JSON.stringify(data, null, 2));
      console.log('\n💡 Common issues:');
      if (response.status === 403) {
        console.log('   ⚠️  Free tier restriction: You can only send test emails to YOUR Resend signup email');
        console.log('   📧 Add to .env: RESEND_TEST_EMAIL=your_resend_signup_email@example.com');
        console.log('   🔧 OR verify a domain at: https://resend.com/domains');
      } else {
        console.log('   - Invalid API key');
        console.log('   - Free tier only allows from: onboarding@resend.dev');
        console.log('   - Need to verify custom domain for other sender addresses');
      }
      console.log('\n');
      return false;
    }
  } catch (error) {
    console.error('❌ Resend API: EXCEPTION');
    console.error('   Error:', error.message);
    console.log('\n');
    return false;
  }
}

async function testBrevo() {
  if (!env.BREVO_API_KEY) {
    console.log('⚠️  Skipping Brevo test - API key not configured\n');
    return false;
  }

  console.log('📧 Testing Brevo API...');
  try {
    const senderEmail = env.SMTP_USER || 'campustocareer25@gmail.com';
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': env.BREVO_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: {
          name: 'Campus to Career AI',
          email: senderEmail,
        },
        to: [{ email: TEST_EMAIL }],
        replyTo: { email: senderEmail },
        subject: '✅ Brevo Test - Campus to Career AI',
        htmlContent: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <title>Test Email</title>
            </head>
            <body style="font-family: Arial, sans-serif; padding: 20px; background-color: #f5f5f5;">
              <div style="max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px;">
                <h1 style="color: #06b6d4;">✅ Brevo API Test Successful!</h1>
                <p>This email was successfully sent via <strong>Brevo API</strong>.</p>
                <p style="color: #666; font-size: 14px;">
                  If you're reading this, it means your Brevo integration is working correctly!
                </p>
                <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 20px 0;">
                <p style="color: #999; font-size: 12px;">
                  Campus to Career AI - Email Service Test<br>
                  ${new Date().toLocaleString()}
                </p>
              </div>
            </body>
          </html>
        `,
        textContent: 'Brevo API Test Successful! This email was sent via Brevo.',
      }),
    });

    const data = await response.json();
    
    if (response.ok) {
      console.log('✅ Brevo API: SUCCESS');
      console.log('   Message ID:', data.messageId);
      console.log('   Sent to:', TEST_EMAIL);
      console.log('   Status: Delivered\n');
      return true;
    } else {
      console.error('❌ Brevo API: FAILED');
      console.error('   Status:', response.status);
      console.error('   Error:', JSON.stringify(data, null, 2));
      console.log('\n💡 Common issues:');
      console.log('   - Invalid API key');
      console.log('   - Sender email not verified in Brevo dashboard');
      console.log('   - Need to verify sender email at: https://app.brevo.com/settings/senders\n');
      return false;
    }
  } catch (error) {
    console.error('❌ Brevo API: EXCEPTION');
    console.error('   Error:', error.message);
    console.log('\n');
    return false;
  }
}

async function runTests() {
  console.log('🚀 Starting Email Service Tests...\n');
  
  const resendResult = await testResend();
  const brevoResult = await testBrevo();
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 Test Summary:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Resend API:', resendResult ? '✅ Working' : '❌ Failed or Not Configured');
  console.log('Brevo API:', brevoResult ? '✅ Working' : '❌ Failed or Not Configured');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  if (!resendResult && !brevoResult) {
    console.log('⚠️  WARNING: No working email services detected!');
    console.log('\n📝 Setup Instructions:');
    console.log('\n1. For Resend (Recommended for Render):');
    console.log('   a. Sign up at: https://resend.com');
    console.log('   b. Get API key from: https://resend.com/api-keys');
    console.log('   c. Add to .env: RESEND_API_KEY=re_xxxxxxxxxxxx');
    console.log('   d. Free tier: 100 emails/day, 3000/month');
    console.log('   e. No verification needed for onboarding@resend.dev');
    
    console.log('\n2. For Brevo:');
    console.log('   a. Sign up at: https://www.brevo.com');
    console.log('   b. Get API key from: https://app.brevo.com/settings/keys/api');
    console.log('   c. IMPORTANT: Verify sender email at: https://app.brevo.com/settings/senders');
    console.log('   d. Add to .env: BREVO_API_KEY=xkeysib-xxxxxxxx');
    console.log('   e. Free tier: 300 emails/day');
    
    console.log('\n3. Add the API keys to Render environment variables:');
    console.log('   - Go to your Render dashboard');
    console.log('   - Select your web service');
    console.log('   - Go to Environment tab');
    console.log('   - Add RESEND_API_KEY or BREVO_API_KEY');
    console.log('   - Click "Save Changes" (this will redeploy)\n');
  } else {
    console.log('✅ At least one email service is working!');
    console.log('   Your emails will be delivered successfully.\n');
  }
}

// Run the tests
runTests().catch(console.error);

#!/usr/bin/env node

/**
 * Email Service Status Check
 * Diagnoses email configuration issues
 */

require('dotenv').config();
const env = require('./src/config/env');

console.log('\n╔════════════════════════════════════════════════════════╗');
console.log('║   Campus to Career - Email Service Status Check       ║');
console.log('╚════════════════════════════════════════════════════════╝\n');

// Check environment variables
console.log('📋 Environment Configuration:');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

const checks = {
  'SMTP_USER': { value: env.SMTP_USER, required: false },
  'SMTP_PASS': { value: env.SMTP_PASS, required: false },
  'SMTP_HOST': { value: env.SMTP_HOST, required: false },
  'SMTP_PORT': { value: env.SMTP_PORT, required: false },
  'RESEND_API_KEY': { value: env.RESEND_API_KEY, required: false },
  'BREVO_API_KEY': { value: env.BREVO_API_KEY, required: false },
};

let hasAnyEmailService = false;

Object.keys(checks).forEach(key => {
  const check = checks[key];
  const hasValue = check.value && check.value.trim() !== '';
  const status = hasValue ? '✅' : '❌';
  
  let displayValue = '';
  if (hasValue) {
    if (key.includes('KEY')) {
      // Show first and last 4 characters of API keys
      const val = check.value;
      if (val.length > 12) {
        displayValue = `${val.substring(0, 8)}...${val.substring(val.length - 4)}`;
      } else {
        displayValue = '***';
      }
    } else if (key.includes('PASS')) {
      displayValue = '***';
    } else {
      displayValue = check.value;
    }
  } else {
    displayValue = 'Not set';
  }
  
  console.log(`${status} ${key.padEnd(20)} : ${displayValue}`);
  
  if (hasValue && (key === 'RESEND_API_KEY' || key === 'BREVO_API_KEY')) {
    hasAnyEmailService = true;
  }
});

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Determine which service will be used
console.log('🔍 Email Service Priority Analysis:');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

if (env.RESEND_API_KEY && env.RESEND_API_KEY.trim()) {
  console.log('1️⃣  Resend API    : ✅ ACTIVE (Primary)');
  console.log('    Status        : Will be used for email delivery');
  console.log('    Port          : HTTPS (443) - Works on Render ✅');
  console.log('    Sender        : onboarding@resend.dev (free tier)');
  console.log('    Reply-To      : ' + (env.SMTP_USER || 'campustocareer25@gmail.com'));
} else {
  console.log('1️⃣  Resend API    : ⚠️  Not configured');
}

console.log('');

if (env.BREVO_API_KEY && env.BREVO_API_KEY.trim()) {
  console.log('2️⃣  Brevo API     : ✅ ACTIVE (Secondary)');
  console.log('    Status        : Will be used if Resend fails');
  console.log('    Port          : HTTPS (443) - Works on Render ✅');
  console.log('    Sender        : ' + (env.SMTP_USER || 'campustocareer25@gmail.com'));
  console.log('    ⚠️  Important    : Sender must be verified in Brevo dashboard');
} else {
  console.log('2️⃣  Brevo API     : ⚠️  Not configured');
}

console.log('');

if (env.SMTP_USER && env.SMTP_PASS) {
  console.log('3️⃣  SMTP Fallback : ⚠️  Configured (Last resort)');
  console.log('    Status        : Will be used if APIs fail');
  console.log('    Host          : ' + (env.SMTP_HOST || 'smtp.gmail.com'));
  console.log('    Port          : ' + (env.SMTP_PORT || '587'));
  console.log('    ⚠️  Warning      : Blocked on Render free tier! ❌');
  console.log('    Works         : Localhost only ✅');
} else {
  console.log('3️⃣  SMTP Fallback : ❌ Not configured');
}

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Overall status
console.log('📊 Overall Status:');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

if (env.RESEND_API_KEY || env.BREVO_API_KEY) {
  console.log('✅ Email delivery: READY FOR PRODUCTION');
  console.log('   At least one HTTP-based email service is configured.');
  console.log('   Emails will be delivered successfully on Render.\n');
  
  if (env.RESEND_API_KEY) {
    console.log('💡 Primary service: Resend API');
    console.log('   Free tier: 100 emails/day, 3000/month');
    console.log('   No sender verification needed');
  } else if (env.BREVO_API_KEY) {
    console.log('💡 Primary service: Brevo API');
    console.log('   Free tier: 300 emails/day');
    console.log('   ⚠️  Ensure sender email is verified!');
  }
} else if (env.SMTP_USER && env.SMTP_PASS) {
  console.log('⚠️  Email delivery: LOCALHOST ONLY');
  console.log('   Only SMTP is configured.');
  console.log('   Emails will work locally but FAIL on Render.\n');
  console.log('❌ Action required for production:');
  console.log('   Add RESEND_API_KEY or BREVO_API_KEY to environment');
} else {
  console.log('❌ Email delivery: NOT CONFIGURED');
  console.log('   No email service is configured.');
  console.log('   Emails will be logged to console only.\n');
  console.log('❌ Action required:');
  console.log('   Run: node setup-email-env.js');
}

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Platform-specific guidance
console.log('🚀 Deployment Guidance:');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

const isProduction = process.env.NODE_ENV === 'production';
const isRender = process.env.RENDER === 'true';

if (isRender || isProduction) {
  console.log('📍 Detected environment: PRODUCTION / RENDER\n');
  
  if (env.RESEND_API_KEY || env.BREVO_API_KEY) {
    console.log('✅ Configuration: Correct for production');
    console.log('   HTTP-based email API is configured');
  } else {
    console.log('❌ Configuration: SMTP will NOT work!');
    console.log('\n🔧 Fix for Render:');
    console.log('   1. Get Resend API key: https://resend.com/api-keys');
    console.log('   2. Add to Render environment: RESEND_API_KEY=re_xxx');
    console.log('   3. Or get Brevo key: https://app.brevo.com/settings/keys/api');
    console.log('   4. Add to Render environment: BREVO_API_KEY=xkeysib-xxx');
  }
} else {
  console.log('📍 Detected environment: DEVELOPMENT / LOCALHOST\n');
  
  if (env.SMTP_USER && env.SMTP_PASS) {
    console.log('✅ Configuration: SMTP should work locally');
  }
  
  if (env.RESEND_API_KEY || env.BREVO_API_KEY) {
    console.log('✅ Configuration: Also ready for production deployment');
  } else {
    console.log('💡 Tip: Add Resend or Brevo for production readiness');
  }
}

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Next steps
console.log('📝 Next Steps:');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

if (!env.RESEND_API_KEY && !env.BREVO_API_KEY) {
  console.log('1. Run setup wizard:');
  console.log('   node setup-email-env.js\n');
  console.log('2. Or manually configure:');
  console.log('   - Get Resend key: https://resend.com/api-keys');
  console.log('   - Add to .env: RESEND_API_KEY=re_xxx');
  console.log('   - Add to Render: Same key\n');
} else {
  console.log('1. Test email delivery:');
  console.log('   node test-email.js\n');
  console.log('2. If tests pass, deploy to Render:');
  console.log('   - Ensure API key is in Render environment');
  console.log('   - Redeploy service');
  console.log('   - Check logs for successful delivery\n');
}

console.log('3. Read full documentation:');
console.log('   backend/EMAIL_SETUP_GUIDE.md\n');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Summary
console.log('📌 Summary:');
if (env.RESEND_API_KEY) {
  console.log('   ✅ Resend configured - Ready for production');
} else if (env.BREVO_API_KEY) {
  console.log('   ✅ Brevo configured - Ready for production');
  console.log('   ⚠️  Verify sender email in Brevo dashboard');
} else if (env.SMTP_USER) {
  console.log('   ⚠️  Only SMTP configured - Works locally only');
  console.log('   ❌ Will fail on Render - Add Resend or Brevo');
} else {
  console.log('   ❌ No email service configured');
  console.log('   🔧 Run: node setup-email-env.js');
}

console.log('\n');

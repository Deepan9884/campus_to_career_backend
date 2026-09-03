#!/usr/bin/env node

/**
 * Interactive Email Service Setup Script
 * Helps configure Resend or Brevo API keys
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

const envPath = path.join(__dirname, '.env');

function readEnv() {
  if (!fs.existsSync(envPath)) {
    return {};
  }
  const content = fs.readFileSync(envPath, 'utf8');
  const env = {};
  content.split('\n').forEach(line => {
    const match = line.match(/^([^=:#]+)=(.*)$/);
    if (match) {
      env[match[1].trim()] = match[2].trim();
    }
  });
  return env;
}

function writeEnv(env, updates) {
  const newEnv = { ...env, ...updates };
  
  // Read existing .env to preserve comments and structure
  let content = '';
  if (fs.existsSync(envPath)) {
    content = fs.readFileSync(envPath, 'utf8');
  }
  
  // Update existing keys or append new ones
  Object.keys(updates).forEach(key => {
    const value = updates[key];
    const regex = new RegExp(`^${key}=.*$`, 'm');
    
    if (content.match(regex)) {
      // Update existing key
      content = content.replace(regex, `${key}=${value}`);
    } else {
      // Append new key
      if (!content.endsWith('\n') && content.length > 0) {
        content += '\n';
      }
      content += `${key}=${value}\n`;
    }
  });
  
  fs.writeFileSync(envPath, content, 'utf8');
}

async function testApiKey(service, apiKey, senderEmail) {
  console.log(`\n🧪 Testing ${service} API key...`);
  
  try {
    if (service === 'Resend') {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Campus to Career AI <onboarding@resend.dev>',
          to: [senderEmail],
          subject: 'Resend API Test',
          html: '<p>Test successful!</p>',
        }),
      });
      
      const data = await response.json();
      return response.ok;
    } else if (service === 'Brevo') {
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sender: { name: 'Campus to Career AI', email: senderEmail },
          to: [{ email: senderEmail }],
          subject: 'Brevo API Test',
          htmlContent: '<p>Test successful!</p>',
        }),
      });
      
      return response.ok;
    }
  } catch (error) {
    console.error(`❌ Test failed: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║   Campus to Career - Email Service Setup Wizard       ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');
  
  const env = readEnv();
  const senderEmail = env.SMTP_USER || 'campustocareer25@gmail.com';
  
  console.log('📋 Current Configuration:');
  console.log(`   Sender Email: ${senderEmail}`);
  console.log(`   Resend API Key: ${env.RESEND_API_KEY ? '✓ Configured' : '✗ Not set'}`);
  console.log(`   Brevo API Key: ${env.BREVO_API_KEY ? '✓ Configured' : '✗ Not set'}\n`);
  
  console.log('📧 Email Service Options:');
  console.log('   1. Resend (Recommended - easiest setup)');
  console.log('   2. Brevo (Alternative - requires sender verification)');
  console.log('   3. Skip (configure manually later)');
  console.log('   4. Test existing configuration\n');
  
  const choice = await question('Select an option (1-4): ');
  
  if (choice === '1') {
    console.log('\n📝 Resend Setup:');
    console.log('   1. Visit: https://resend.com');
    console.log('   2. Sign up for a free account');
    console.log('   3. Go to: https://resend.com/api-keys');
    console.log('   4. Create a new API key');
    console.log('   5. Copy the key (starts with re_)\n');
    
    const apiKey = await question('Paste your Resend API key: ');
    
    if (!apiKey.startsWith('re_')) {
      console.log('⚠️  Warning: API key should start with "re_"');
    }
    
    const testChoice = await question('\nTest the API key now? (y/n): ');
    
    if (testChoice.toLowerCase() === 'y') {
      const isValid = await testApiKey('Resend', apiKey.trim(), senderEmail);
      if (isValid) {
        console.log('✅ API key is valid!');
        writeEnv(env, { RESEND_API_KEY: apiKey.trim() });
        console.log('✅ Saved to .env file');
      } else {
        console.log('❌ API key test failed. Please check your key.');
        const saveAnyway = await question('Save anyway? (y/n): ');
        if (saveAnyway.toLowerCase() === 'y') {
          writeEnv(env, { RESEND_API_KEY: apiKey.trim() });
          console.log('✅ Saved to .env file');
        }
      }
    } else {
      writeEnv(env, { RESEND_API_KEY: apiKey.trim() });
      console.log('✅ Saved to .env file (not tested)');
    }
    
  } else if (choice === '2') {
    console.log('\n📝 Brevo Setup:');
    console.log('   1. Visit: https://www.brevo.com');
    console.log('   2. Sign up for a free account');
    console.log('   3. IMPORTANT: Verify your sender email at:');
    console.log('      https://app.brevo.com/settings/senders');
    console.log('   4. Get API key from: https://app.brevo.com/settings/keys/api');
    console.log('   5. Copy the API v3 key (starts with xkeysib-)\n');
    
    const apiKey = await question('Paste your Brevo API key: ');
    
    if (!apiKey.startsWith('xkeysib-')) {
      console.log('⚠️  Warning: API key should start with "xkeysib-"');
    }
    
    console.log(`\n⚠️  Important: Make sure ${senderEmail} is verified in Brevo!`);
    const testChoice = await question('Test the API key now? (y/n): ');
    
    if (testChoice.toLowerCase() === 'y') {
      const isValid = await testApiKey('Brevo', apiKey.trim(), senderEmail);
      if (isValid) {
        console.log('✅ API key is valid!');
        writeEnv(env, { BREVO_API_KEY: apiKey.trim() });
        console.log('✅ Saved to .env file');
      } else {
        console.log('❌ API key test failed.');
        console.log('💡 Common causes:');
        console.log('   - Invalid API key');
        console.log('   - Sender email not verified');
        console.log('   - Daily limit exceeded');
        const saveAnyway = await question('\nSave anyway? (y/n): ');
        if (saveAnyway.toLowerCase() === 'y') {
          writeEnv(env, { BREVO_API_KEY: apiKey.trim() });
          console.log('✅ Saved to .env file');
        }
      }
    } else {
      writeEnv(env, { BREVO_API_KEY: apiKey.trim() });
      console.log('✅ Saved to .env file (not tested)');
    }
    
  } else if (choice === '4') {
    console.log('\n🧪 Testing current configuration...\n');
    require('./test-email.js');
    
  } else {
    console.log('\n📖 Manual setup instructions in: EMAIL_SETUP_GUIDE.md');
  }
  
  console.log('\n✨ Next steps:');
  console.log('   1. Run: node test-email.js (to test email delivery)');
  console.log('   2. Add the same API key to Render environment variables');
  console.log('   3. Redeploy your Render service');
  console.log('\n📖 Full guide: backend/EMAIL_SETUP_GUIDE.md\n');
  
  rl.close();
}

main().catch(error => {
  console.error('Error:', error.message);
  rl.close();
  process.exit(1);
});

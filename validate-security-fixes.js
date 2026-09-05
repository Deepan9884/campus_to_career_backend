/**
 * Security Fixes Validation Script
 * Validates all implemented security fixes for errors and breaking changes
 */

const path = require('path');

console.log('🔍 Starting Security Fixes Validation...\n');

let errors = [];
let warnings = [];
let passed = 0;

// Test 1: Check Required Modules Exist
console.log('1️⃣  Checking module existence...');
try {
  require('./src/utils/passwordValidator');
  require('./src/utils/aiOutputSanitizer');
  require('./src/services/encryption.service');
  require('./src/models/User.model');
  passed++;
  console.log('   ✅ All new modules exist\n');
} catch (err) {
  errors.push(`Module loading failed: ${err.message}`);
  console.log(`   ❌ Error: ${err.message}\n`);
}

// Test 2: Validate Password Validator
console.log('2️⃣  Testing Password Validator...');
try {
  const { validatePasswordStrength, validatePasswordMiddleware, calculateEntropy } = require('./src/utils/passwordValidator');
  
  // Test weak password
  const weak = validatePasswordStrength('password');
  if (weak.valid) {
    errors.push('Password validator accepts weak password');
    console.log('   ❌ Accepts weak password\n');
  } else {
    passed++;
    console.log('   ✅ Rejects weak password');
  }
  
  // Test strong password
  const strong = validatePasswordStrength('MySecure@Pass123');
  if (!strong.valid) {
    errors.push('Password validator rejects strong password');
    console.log('   ❌ Rejects strong password\n');
  } else {
    passed++;
    console.log('   ✅ Accepts strong password');
  }
  
  // Test entropy calculation
  const entropy = calculateEntropy('MySecure@Pass123');
  if (entropy > 50) {
    passed++;
    console.log(`   ✅ Entropy calculation works (${entropy} bits)\n`);
  } else {
    warnings.push(`Low entropy value: ${entropy}`);
    console.log(`   ⚠️  Low entropy: ${entropy} bits\n`);
  }
  
} catch (err) {
  errors.push(`Password validator test failed: ${err.message}`);
  console.log(`   ❌ Error: ${err.message}\n`);
}

// Test 3: Validate Encryption Service
console.log('3️⃣  Testing Encryption Service...');
try {
  // Set test encryption key
  process.env.ENCRYPTION_KEY = 'a'.repeat(64);
  
  const { 
    encrypt, 
    decrypt, 
    isEncrypted, 
    getEncryptionVersion,
    reencrypt,
    CURRENT_KEY_VERSION 
  } = require('./src/services/encryption.service');
  
  // Test encryption
  const plaintext = 'Test Data 123';
  const encrypted = encrypt(plaintext);
  
  if (!isEncrypted(encrypted)) {
    errors.push('Encryption does not produce encrypted format');
    console.log('   ❌ Encryption format invalid\n');
  } else {
    passed++;
    console.log('   ✅ Encryption produces correct format');
  }
  
  // Test decryption
  const decrypted = decrypt(encrypted);
  if (decrypted !== plaintext) {
    errors.push(`Decryption failed: expected "${plaintext}", got "${decrypted}"`);
    console.log('   ❌ Decryption produces wrong value\n');
  } else {
    passed++;
    console.log('   ✅ Decryption works correctly');
  }
  
  // Test versioning
  const version = getEncryptionVersion(encrypted);
  if (version !== CURRENT_KEY_VERSION) {
    warnings.push(`Version mismatch: expected ${CURRENT_KEY_VERSION}, got ${version}`);
    console.log(`   ⚠️  Version mismatch: ${version}\n`);
  } else {
    passed++;
    console.log(`   ✅ Versioning works (v${version})\n`);
  }
  
} catch (err) {
  errors.push(`Encryption service test failed: ${err.message}`);
  console.log(`   ❌ Error: ${err.message}\n`);
}

// Test 4: Validate AI Output Sanitizer
console.log('4️⃣  Testing AI Output Sanitizer...');
try {
  const { 
    sanitizeHTML, 
    containsDangerousPatterns,
    containsDataExfiltration,
    secureAIOutput
  } = require('./src/utils/aiOutputSanitizer');
  
  // Test XSS removal
  const xssInput = '<script>alert("xss")</script>Hello';
  const sanitized = sanitizeHTML(xssInput);
  
  if (sanitized.includes('<script>')) {
    errors.push('Sanitizer does not remove script tags');
    console.log('   ❌ XSS not removed\n');
  } else {
    passed++;
    console.log('   ✅ XSS sanitization works');
  }
  
  // Test dangerous pattern detection
  const sqlInjection = 'SELECT * FROM users WHERE email = "test"';
  if (!containsDangerousPatterns(sqlInjection)) {
    warnings.push('SQL injection not detected');
    console.log('   ⚠️  SQL injection not detected');
  } else {
    passed++;
    console.log('   ✅ Dangerous patterns detected');
  }
  
  // Test data exfiltration detection
  const apiKey = 'sk-1234567890abcdefghijklmnop';
  if (!containsDataExfiltration(apiKey)) {
    errors.push('API key pattern not detected');
    console.log('   ❌ API key not detected\n');
  } else {
    passed++;
    console.log('   ✅ Data exfiltration detection works\n');
  }
  
} catch (err) {
  errors.push(`AI sanitizer test failed: ${err.message}`);
  console.log(`   ❌ Error: ${err.message}\n`);
}

// Test 5: Check Environment Variable Requirements
console.log('5️⃣  Checking Environment Variable Requirements...');
try {
  const env = require('./src/config/env');
  
  // These should be defined (even if empty in test)
  const requiredVars = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'MONGODB_URI', 'RESET_TOKEN_SECRET'];
  let envPassed = true;
  
  for (const varName of requiredVars) {
    if (!env[varName]) {
      warnings.push(`${varName} not configured`);
      console.log(`   ⚠️  ${varName} not configured`);
      envPassed = false;
    }
  }
  
  if (envPassed) {
    passed++;
    console.log('   ✅ Required environment variables defined\n');
  } else {
    console.log('   ℹ️  Some variables missing (expected in test environment)\n');
  }
  
} catch (err) {
  errors.push(`Environment check failed: ${err.message}`);
  console.log(`   ❌ Error: ${err.message}\n`);
}

// Test 6: Verify JWT Expiry Changed
console.log('6️⃣  Checking JWT Configuration...');
try {
  const env = require('./src/config/env');
  
  if (env.JWT_EXPIRES_IN === '15m') {
    passed++;
    console.log('   ✅ JWT expiry set to 15 minutes\n');
  } else {
    warnings.push(`JWT expiry is ${env.JWT_EXPIRES_IN}, expected 15m`);
    console.log(`   ⚠️  JWT expiry is ${env.JWT_EXPIRES_IN}, should be 15m\n`);
  }
  
} catch (err) {
  errors.push(`JWT config check failed: ${err.message}`);
  console.log(`   ❌ Error: ${err.message}\n`);
}

// Test 7: Check for Syntax Errors in Modified Files
console.log('7️⃣  Checking syntax of modified files...');
const modifiedFiles = [
  './src/models/User.model.js',
  './src/controllers/auth.controller.js',
  './src/controllers/admin.controller.js',
  './src/services/ai.service.js',
  './src/app.js',
  './src/routes/auth.routes.js'
];

let syntaxOk = true;
for (const file of modifiedFiles) {
  try {
    require(file);
    console.log(`   ✅ ${path.basename(file)}`);
  } catch (err) {
    syntaxOk = false;
    errors.push(`Syntax error in ${file}: ${err.message}`);
    console.log(`   ❌ ${path.basename(file)}: ${err.message}`);
  }
}

if (syntaxOk) {
  passed++;
  console.log();
}

// Print Summary
console.log('═'.repeat(70));
console.log('📊 VALIDATION SUMMARY\n');
console.log(`✅ Passed:   ${passed} tests`);
console.log(`⚠️  Warnings: ${warnings.length}`);
console.log(`❌ Errors:   ${errors.length}`);
console.log('═'.repeat(70));

if (warnings.length > 0) {
  console.log('\n⚠️  WARNINGS:');
  warnings.forEach((w, i) => console.log(`   ${i + 1}. ${w}`));
}

if (errors.length > 0) {
  console.log('\n❌ ERRORS:');
  errors.forEach((e, i) => console.log(`   ${i + 1}. ${e}`));
  console.log('\n🔴 Validation FAILED - Please fix the errors above');
  process.exit(1);
} else {
  console.log('\n🎉 All validation tests PASSED!');
  console.log('✨ Security fixes are ready for deployment\n');
  process.exit(0);
}

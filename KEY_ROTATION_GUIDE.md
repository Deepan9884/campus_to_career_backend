# Encryption Key Rotation Guide

This guide explains how to rotate encryption keys for PII data in the Campus to Career platform.

## Overview

The platform uses AES-256-GCM encryption with key versioning support. This allows you to rotate keys without breaking existing encrypted data.

## When to Rotate Keys

Keys should be rotated:
- **Annually** as a security best practice
- **Immediately** if a key is suspected to be compromised
- When required by compliance regulations
- After staff changes that affect key access

## Key Rotation Process

### Step 1: Generate New Key

Generate a new 64-character hexadecimal encryption key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Example output:
```
a1b2c3d4e5f6... (64 characters)
```

### Step 2: Backup Current Configuration

**CRITICAL:** Before making changes, backup your current environment configuration and database.

```bash
# Backup .env file
cp backend/.env backend/.env.backup.$(date +%Y%m%d)

# Backup database (example for MongoDB)
mongodump --uri="your_mongodb_uri" --out=backup_$(date +%Y%m%d)
```

### Step 3: Update Environment Variables

Add the new key while keeping the old one temporarily:

```bash
# In backend/.env

# Old key (for decryption during migration)
ENCRYPTION_KEY_V0=your_old_encryption_key_here

# New key (current version)
ENCRYPTION_KEY=your_new_encryption_key_here
```

### Step 4: Deploy the Updated Configuration

Deploy the application with both keys configured. This allows:
- **Decryption** of old data using `ENCRYPTION_KEY_V0`
- **Encryption** of new data using `ENCRYPTION_KEY`

```bash
# Restart the application
pm2 restart campus-to-career-backend
# or
docker-compose restart backend
# or
npm run start
```

### Step 5: Run Data Migration Script

Create and run a migration script to re-encrypt all existing data:

```javascript
// backend/scripts/rotateEncryptionKeys.js
const mongoose = require('mongoose');
const User = require('../src/models/User.model');
const { reencrypt, isEncrypted, getEncryptionVersion, CURRENT_KEY_VERSION } = require('../src/services/encryption.service');

async function rotateUserEncryption() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  const users = await User.find({});
  let rotated = 0;
  
  for (const user of users) {
    let needsSave = false;
    
    // Check and rotate each encrypted field
    if (isEncrypted(user.name) && getEncryptionVersion(user.name) !== CURRENT_KEY_VERSION) {
      user.name = reencrypt(user.name);
      needsSave = true;
    }
    
    if (isEncrypted(user.bio) && getEncryptionVersion(user.bio) !== CURRENT_KEY_VERSION) {
      user.bio = reencrypt(user.bio);
      needsSave = true;
    }
    
    if (isEncrypted(user.githubUsername) && getEncryptionVersion(user.githubUsername) !== CURRENT_KEY_VERSION) {
      user.githubUsername = reencrypt(user.githubUsername);
      needsSave = true;
    }
    
    if (isEncrypted(user.linkedinUrl) && getEncryptionVersion(user.linkedinUrl) !== CURRENT_KEY_VERSION) {
      user.linkedinUrl = reencrypt(user.linkedinUrl);
      needsSave = true;
    }
    
    if (user.profile?.registerNumber && isEncrypted(user.profile.registerNumber) && getEncryptionVersion(user.profile.registerNumber) !== CURRENT_KEY_VERSION) {
      user.profile.registerNumber = reencrypt(user.profile.registerNumber);
      needsSave = true;
    }
    
    if (user.profile?.location && isEncrypted(user.profile.location) && getEncryptionVersion(user.profile.location) !== CURRENT_KEY_VERSION) {
      user.profile.location = reencrypt(user.profile.location);
      needsSave = true;
    }
    
    if (needsSave) {
      await user.save();
      rotated++;
      console.log(`Rotated encryption for user ${user._id}`);
    }
  }
  
  console.log(`\n✓ Successfully rotated encryption for ${rotated} users`);
  process.exit(0);
}

rotateUserEncryption().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
```

Run the migration:

```bash
cd backend
node scripts/rotateEncryptionKeys.js
```

### Step 6: Verify Migration

After migration completes, verify that:

1. All users can still login
2. Profile data is correctly displayed
3. No decryption errors in logs

```bash
# Check recent logs for encryption errors
tail -n 100 backend/backend.log | grep -i "encryption\|decrypt"
```

### Step 7: Remove Old Key

**IMPORTANT:** Only proceed after confirming Step 6 is successful.

After verifying all data has been re-encrypted:

```bash
# In backend/.env
# Remove the old key variable
# ENCRYPTION_KEY_V0=...  # DELETE THIS LINE

# Keep only the current key
ENCRYPTION_KEY=your_new_encryption_key_here
```

### Step 8: Increment Version Number

Update the version number in the encryption service:

```javascript
// backend/src/services/encryption.service.js
const CURRENT_KEY_VERSION = 2; // Increment from 1 to 2
```

### Step 9: Final Restart and Verification

```bash
# Restart application
pm2 restart campus-to-career-backend

# Monitor logs for any issues
pm2 logs campus-to-career-backend --lines 100
```

## Rollback Procedure

If migration fails:

1. **Stop** the application immediately
2. **Restore** the backup `.env` file: `cp backend/.env.backup.YYYYMMDD backend/.env`
3. **Restore** the database from backup if any data was corrupted
4. **Restart** the application
5. **Investigate** the failure cause before retrying

## Security Best Practices

1. **Never** commit encryption keys to version control
2. **Store** keys in secure secret management systems (AWS Secrets Manager, HashiCorp Vault, etc.)
3. **Limit** access to encryption keys to essential personnel only
4. **Audit** key access and rotation activities
5. **Test** the rotation process in a staging environment first
6. **Document** each rotation with date, reason, and person responsible

## Emergency Key Rotation

If a key is compromised:

1. **Immediately** generate a new key
2. **Follow** Steps 1-9 above **without delay**
3. **Audit** all system access logs
4. **Notify** affected users if required by data protection regulations
5. **Investigate** the compromise and close security gaps

## Compliance Notes

### GDPR
- Key rotation is part of "appropriate technical measures" (Article 32)
- Document all key rotations in your security log
- Rotation frequency should be documented in your Data Protection Policy

### SOC 2
- Annual key rotation is a Type II control
- Maintain audit trail of all key management activities

## Support

For assistance with key rotation:
- Technical Support: support@campustocareer.ai
- Security Team: security@campustocareer.ai
- Emergency Hotline: [Your emergency contact]

## Version History

- **v1.0** (2025-01): Initial key versioning support added
- **v1.1** (2025-01): Added automated migration script

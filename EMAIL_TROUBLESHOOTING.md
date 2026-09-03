# Email Troubleshooting Guide

Quick reference for common email delivery issues.

## 🔍 Quick Diagnosis

Run this first:
```bash
cd backend
npm run email:check
```

---

## Common Issues

### 1. Emails Not Sending on Render ❌

**Symptom:** Render logs show SMTP timeout errors

**In logs:**
```
🚨 [Email] SMTP blocked on Render
```

**Solution:**
```bash
# Add to Render environment:
RESEND_API_KEY=re_xxxx...
# OR
BREVO_API_KEY=xkeysib-xxxx...

# Then redeploy
```

**Why:** Render blocks ports 25, 465, 587. Use HTTP APIs instead.

---

### 2. Resend 403 Error During Testing ⚠️

**Symptom:** Test email fails with 403 error

**Error message:**
```
You can only send testing emails to your own email address
```

**Solution 1 - Add Your Email:**
```bash
# In .env, add:
RESEND_TEST_EMAIL=your_resend_signup_email@example.com
```

**Solution 2 - Verify Domain:**
- Go to: https://resend.com/domains
- Add and verify your domain
- Update sender email in code

**Note:** This is ONLY for testing. Production emails work fine!

---

### 3. Brevo "Sender Not Verified" ❌

**Symptom:** Brevo returns "sender not verified" error

**Solution:**
1. Visit: https://app.brevo.com/settings/senders
2. Click "Add a new sender"
3. Enter: `campustocareer25@gmail.com`
4. **Check Gmail** for verification email from Brevo
5. Click verification link
6. Wait for "Verified" status (green checkmark)

**Important:** You MUST verify the sender before Brevo will work!

---

### 4. Invalid API Key ❌

**Symptom:** 401 or 403 authentication errors

**For Resend:**
```bash
# Get new key from: https://resend.com/api-keys
# Key should start with: re_
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**For Brevo:**
```bash
# Get new key from: https://app.brevo.com/settings/keys/api
# Key should start with: xkeysib-
BREVO_API_KEY=xkeysib-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**Check:**
- No extra spaces before/after key
- Key is complete and not truncated
- Using correct key for correct service

---

### 5. Daily Limit Exceeded ⚠️

**Symptom:** Emails stop sending after X emails

**Free tier limits:**
- Resend: 100 emails/day, 3000/month
- Brevo: 300 emails/day

**Solutions:**
- Use both services for 400 emails/day combined
- Upgrade to paid plan
- Wait until limit resets (next day)

**Check usage:**
- Resend: https://resend.com/emails
- Brevo: https://app.brevo.com/statistics

---

### 6. Emails Going to Spam 📬

**Symptom:** Emails delivered but in spam folder

**Solutions:**

1. **SPF/DKIM Records** (for custom domain):
   - Resend: https://resend.com/docs/dashboard/domains/introduction
   - Brevo: https://help.brevo.com/hc/en-us/articles/209554829

2. **Email Content:**
   - Don't use all caps
   - Avoid spam trigger words
   - Include unsubscribe link (already in templates)
   - Use plain text version (already included)

3. **Sender Reputation:**
   - Use verified domains
   - Don't send too many emails at once
   - Monitor bounce rates

---

### 7. Emails Not Received ❌

**Symptom:** No email arrives (not even in spam)

**Check in order:**

1. **Recipient email correct?**
   ```bash
   # Check logs for delivery confirmation
   [Email via Resend] Delivered to user@example.com (ID: xxx)
   ```

2. **Service working?**
   ```bash
   npm run email:test
   ```

3. **Check service status:**
   - Resend: https://resend.com/status
   - Brevo: https://status.brevo.com

4. **Check recipient's spam folder**

5. **Check recipient's email provider:**
   - Some providers block or delay emails
   - Gmail sometimes delays by 5-10 minutes

---

### 8. Environment Variables Not Working 🔧

**Symptom:** Logs show "Not set" for API keys

**For local development:**
```bash
# Check .env file exists
ls -la backend/.env

# Check .env has no syntax errors
# Make sure there are no quotes around values:
RESEND_API_KEY=re_xxxx        # ✅ Correct
RESEND_API_KEY="re_xxxx"      # ❌ Wrong
```

**For Render:**
```bash
# In Render dashboard:
1. Go to your service
2. Click "Environment" tab
3. Verify variables are there
4. Click "Save Changes" (triggers redeploy)
```

---

### 9. Wrong Email Service Being Used 🔄

**Symptom:** Logs show SMTP instead of Resend/Brevo

**Check logs for:**
```bash
# Should see:
[Email via Resend] Delivered...
# OR
[Email via Brevo] Delivered...

# Should NOT see (on Render):
[Email via SMTP] Delivered...
```

**Solution:**
```bash
# Verify API keys are set:
npm run email:check

# Should show:
✅ RESEND_API_KEY : re_xxxx...
✅ BREVO_API_KEY  : xsmtpsib-xxx...
```

---

### 10. Testing Issues 🧪

**Symptom:** Test script fails but production might work

**For Resend testing:**
```bash
# Free tier restriction - only send to YOUR email
RESEND_TEST_EMAIL=your_resend_signup_email@example.com
```

**For Brevo testing:**
```bash
# Verify sender first!
# Visit: https://app.brevo.com/settings/senders
```

**Alternative testing:**
```bash
# Test in production environment instead
# Deploy to Render with API keys
# Use password reset feature to test
```

---

## 🔧 Diagnostic Commands

```bash
# Check configuration
npm run email:check

# Test email delivery
npm run email:test

# Interactive setup
npm run email:setup

# Check environment variables
node -e "console.log(require('./src/config/env'))"

# Check Render logs (in Render dashboard)
# Look for: [Email via Resend] or [Email via Brevo]
```

---

## 📋 Pre-Deployment Checklist

Before deploying to Render:

- [ ] `npm run email:check` shows green checkmarks
- [ ] `npm run email:test` works (or shows expected 403 for Resend)
- [ ] API keys added to Render environment
- [ ] Brevo sender verified (if using Brevo)
- [ ] Read EMAIL_SETUP_GUIDE.md
- [ ] Test password reset in production after deploy

---

## 🆘 Still Having Issues?

1. **Check status:** `npm run email:check`
2. **Read full guide:** `EMAIL_SETUP_GUIDE.md`
3. **Check service status:**
   - https://resend.com/status
   - https://status.brevo.com
4. **Check Render logs** for specific error messages
5. **Verify environment variables** are saved in Render

---

## 📞 Service Support

- **Resend Support:** https://resend.com/docs
- **Brevo Support:** https://help.brevo.com
- **Render Support:** https://render.com/docs

---

*Quick Tip: Most issues are due to missing environment variables or unverified senders.*

# Email Service Setup Guide - Campus to Career

## Overview

Your Campus to Career platform supports **three email delivery methods**:

1. **Resend API** (Recommended for Render) - HTTP-based, works on all platforms
2. **Brevo API** (Alternative) - HTTP-based, works on all platforms  
3. **SMTP** (Fallback) - Works locally, blocked on Render free tier

## Why SMTP Doesn't Work on Render

Render's free tier blocks outbound SMTP ports (25, 465, 587) for security reasons. This is why you need to use HTTP-based email APIs like Resend or Brevo instead.

## Solution 1: Resend (Recommended)

### Why Choose Resend?
- ✅ Works instantly on Render
- ✅ No sender verification needed for free tier
- ✅ 100 emails/day, 3000/month (free)
- ✅ Excellent deliverability
- ✅ Simple setup

### Setup Steps:

#### 1. Create Resend Account
- Visit: https://resend.com
- Sign up for free account
- Verify your email

#### 2. Get API Key
- Go to: https://resend.com/api-keys
- Click "Create API Key"
- Give it a name (e.g., "Campus to Career Production")
- Copy the API key (starts with `re_`)

#### 3. Add to Local Environment
Add to `backend/.env`:
```env
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

#### 4. Add to Render
- Go to your Render dashboard: https://dashboard.render.com
- Select your web service
- Click "Environment" tab
- Click "Add Environment Variable"
- Key: `RESEND_API_KEY`
- Value: `re_xxxxxxxxxxxxxxxxxxxxxxxxxxxx`
- Click "Save Changes" (this will trigger a redeploy)

#### 5. Test It
```bash
cd backend
node test-email.js
```

### Important Notes for Resend:
- Free tier can only send from: `onboarding@resend.dev`
- Reply-to will be set to your `SMTP_USER` email
- To use your own domain (campustocareer.com), you need to:
  1. Add and verify your domain in Resend dashboard
  2. Update the `from` address in `email.service.js`

---

## Solution 2: Brevo (SendinBlue)

### Why Choose Brevo?
- ✅ Works on Render
- ✅ 300 emails/day (free)
- ✅ Can use your Gmail as sender
- ⚠️ Requires sender verification

### Setup Steps:

#### 1. Create Brevo Account
- Visit: https://www.brevo.com
- Sign up for free account
- Complete account setup

#### 2. Verify Sender Email
**This is crucial - Brevo won't work without this step!**

- Go to: https://app.brevo.com/settings/senders
- Click "Add a new sender"
- Enter: `campustocareer25@gmail.com` (or your email)
- Name: `Campus to Career AI`
- Click "Add"
- **Check your Gmail inbox** for verification email from Brevo
- Click the verification link in the email
- Wait for "Verified" status in Brevo dashboard

#### 3. Get API Key
- Go to: https://app.brevo.com/settings/keys/api
- Copy your API v3 key (starts with `xkeysib-`)

#### 4. Add to Local Environment
Add to `backend/.env`:
```env
BREVO_API_KEY=xkeysib-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

#### 5. Add to Render
- Go to your Render dashboard
- Select your web service
- Click "Environment" tab
- Add: `BREVO_API_KEY=xkeysib-...`
- Click "Save Changes"

#### 6. Test It
```bash
cd backend
node test-email.js
```

---

## Priority Order (How It Works)

Your email service tries methods in this order:

1. **Resend API** (if `RESEND_API_KEY` is set)
   - Uses HTTPS port 443 ✅
   - Works on Render ✅

2. **Brevo API** (if `BREVO_API_KEY` is set)
   - Uses HTTPS port 443 ✅
   - Works on Render ✅

3. **SMTP Fallback** (if neither API key is set)
   - Uses ports 587/465 ❌
   - Blocked on Render free tier ❌
   - Works locally ✅

---

## Testing Your Setup

### Test Locally
```bash
cd backend
node test-email.js
```

### Test on Render
After deploying with API keys:

1. Check Render logs:
```bash
# Look for these success messages:
[Email via Resend] Delivered to user@example.com (ID: xxx)
# OR
[Email via Brevo] Delivered to user@example.com (MessageId: xxx)
```

2. If you see errors:
```bash
# Bad: SMTP blocked
🚨 [Email] SMTP blocked on Render. Add RESEND_API_KEY or BREVO_API_KEY

# Good: Using API
[Email via Resend] Delivered to user@example.com
```

---

## Troubleshooting

### Resend Issues

**Error: "Invalid API key"**
- Check API key is copied correctly
- Ensure it starts with `re_`
- Regenerate key if needed

**Error: "Invalid from address"**
- Free tier must use: `onboarding@resend.dev`
- Verify custom domain if using your own

### Brevo Issues

**Error: "Sender not verified"**
- Go to: https://app.brevo.com/settings/senders
- Check sender status is "Verified"
- Resend verification email if needed
- Wait a few minutes after verification

**Error: "Invalid API key"**
- Get key from: https://app.brevo.com/settings/keys/api
- Must use v3 API key (starts with `xkeysib-`)
- Check for typos in .env file

**Error: "Daily limit exceeded"**
- Free tier: 300 emails/day
- Upgrade to paid plan or use Resend as backup

### General Issues

**Emails not sending on Render**
```bash
# Check Render logs for:
1. API key is set: Look for "✓ Set" in logs
2. Service being used: Look for "[Email via Resend]" or "[Email via Brevo]"
3. Not falling back to SMTP: Should NOT see "[Email via SMTP]"
```

**Still using SMTP on Render**
- Verify environment variables are saved in Render
- Redeploy after adding variables
- Check variable names are exact: `RESEND_API_KEY` or `BREVO_API_KEY`

---

## Environment Variables Summary

Add these to your `backend/.env` AND Render environment:

```env
# Existing SMTP (works locally, blocked on Render)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=campustocareer25@gmail.com
SMTP_PASS=your_gmail_app_password
SMTP_FROM="Campus to Career AI" <campustocareer25@gmail.com>

# Resend (works everywhere including Render) 
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Brevo (works everywhere including Render)
BREVO_API_KEY=xkeysib-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**Note:** You only need ONE of Resend or Brevo API keys for Render deployment!

---

## Quick Start (TL;DR)

### For Render Deployment:

1. **Choose Resend (easier):**
   ```bash
   # Sign up: https://resend.com
   # Get API key: https://resend.com/api-keys
   # Add to Render env: RESEND_API_KEY=re_xxx...
   ```

2. **Or choose Brevo:**
   ```bash
   # Sign up: https://www.brevo.com
   # VERIFY sender at: https://app.brevo.com/settings/senders
   # Get API key: https://app.brevo.com/settings/keys/api
   # Add to Render env: BREVO_API_KEY=xkeysib-xxx...
   ```

3. **Test:**
   ```bash
   cd backend
   node test-email.js
   ```

---

## Support & Documentation

- **Resend Docs:** https://resend.com/docs
- **Brevo Docs:** https://developers.brevo.com/docs
- **Render Docs:** https://render.com/docs

---

## Email Templates Included

Your platform sends these emails:
- ✅ Password reset emails
- ✅ Exam assignment notifications
- ✅ Proctoring violation alerts
- ✅ Proctoring unblock notifications
- ✅ New login security alerts
- ✅ Welcome emails

All templates work with Resend, Brevo, and SMTP!

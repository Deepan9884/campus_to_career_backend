# Email Service - Quick Start Guide

## 🚀 Quick Setup (2 minutes)

### Step 1: Check Current Status
```bash
cd backend
node check-email-status.js
```

### Step 2: Setup Email Service
```bash
node setup-email-env.js
```

### Step 3: Test Email Delivery
```bash
node test-email.js
```

That's it! 🎉

---

## 📚 What's Included

### Scripts

1. **`check-email-status.js`** - Diagnostic tool
   - Shows current configuration
   - Identifies issues
   - Provides next steps

2. **`setup-email-env.js`** - Interactive setup wizard
   - Guides you through API key setup
   - Tests configuration
   - Saves to .env file

3. **`test-email.js`** - Email delivery test
   - Tests Resend API
   - Tests Brevo API  
   - Shows which service is working

### Documentation

- **`EMAIL_SETUP_GUIDE.md`** - Complete documentation
  - Detailed setup instructions
  - Troubleshooting guide
  - API key management
  - Render deployment guide

---

## 🎯 Why This Matters

**Problem:** Render blocks SMTP ports (25, 465, 587)
**Solution:** Use HTTP-based email APIs (Resend or Brevo)

### Email Service Priority

1. **Resend API** (if configured) - Primary ✅
2. **Brevo API** (if configured) - Fallback ✅
3. **SMTP** (legacy) - Localhost only ⚠️

---

## ✅ For Render Deployment

### Option 1: Resend (Recommended)

```bash
# 1. Get API key from: https://resend.com/api-keys
# 2. Add to Render environment:
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxx

# 3. Redeploy
```

**Benefits:**
- ✅ Works instantly
- ✅ No sender verification
- ✅ 100 emails/day (free)

### Option 2: Brevo

```bash
# 1. Verify sender at: https://app.brevo.com/settings/senders
# 2. Get API key from: https://app.brevo.com/settings/keys/api
# 3. Add to Render environment:
BREVO_API_KEY=xkeysib-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# 4. Redeploy
```

**Benefits:**
- ✅ Works on Render
- ✅ 300 emails/day (free)
- ⚠️ Requires sender verification

---

## 🔧 Troubleshooting

### Check Configuration
```bash
node check-email-status.js
```

### Test Delivery
```bash
node test-email.js
```

### Common Issues

**❌ "SMTP blocked on Render"**
- Add `RESEND_API_KEY` or `BREVO_API_KEY` to Render environment
- Redeploy service

**❌ "Brevo sender not verified"**
- Go to: https://app.brevo.com/settings/senders
- Verify your sender email
- Check email for verification link

**❌ "Invalid Resend API key"**
- Regenerate key at: https://resend.com/api-keys
- Ensure it starts with `re_`

---

## 📧 Email Templates

Your platform sends these emails automatically:

- ✅ Password reset emails
- ✅ Exam assignment notifications
- ✅ Proctoring alerts
- ✅ Security login alerts
- ✅ Welcome emails

All templates work with any email service!

---

## 🎓 Learn More

- Full guide: `EMAIL_SETUP_GUIDE.md`
- Resend docs: https://resend.com/docs
- Brevo docs: https://developers.brevo.com/docs

---

## 💡 Tips

1. **Local Development:** SMTP works fine locally
2. **Production:** Use Resend or Brevo for Render
3. **Testing:** Use `test-email.js` before deploying
4. **Monitoring:** Check Render logs for `[Email via Resend]` or `[Email via Brevo]`

---

## 🆘 Need Help?

1. Run: `node check-email-status.js`
2. Read: `EMAIL_SETUP_GUIDE.md`
3. Check Render logs for email delivery status

---

**✨ Pro Tip:** Keep both Resend and Brevo configured for redundancy!

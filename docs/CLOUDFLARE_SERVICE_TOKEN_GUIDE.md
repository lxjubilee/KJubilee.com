# Getting Cloudflare Access Service Tokens

## Step-by-Step Guide to Find/Create Service Tokens

### Step 1: Open Cloudflare Zero Trust Dashboard

1. Go to: **https://one.dash.cloudflare.com/**
2. Log in with your Cloudflare account
3. Select your **account name** (top left dropdown)

### Step 2: Navigate to Access → Service Tokens

1. Left sidebar → **Access** (you'll see it listed)
2. Click on **Access** to expand submenu
3. Click on **Service Tokens** (NOT "Applications")

![Navigation Path: Access > Service Tokens]

### Step 3: Look for Existing Service Tokens

You should see a list of service tokens. Look for one that:
- Is named something like "jubilee-enterprise", "inspirecortex", or "api-access"
- Or any token created for InspireCortex API access

**If you see matching tokens:**
1. Click on the token name
2. You'll see two values displayed:
   - **Client ID** (looks like: `abc123def456...` — hex string)
   - **Client Secret** (looks like: `base64encodedstringhere...` — longer base64 string)
3. Copy both values
4. **STOP here and provide them to me**

### Step 4: If NO Existing Service Tokens (Create New One)

If you don't see a suitable token, create one:

1. Click the **"Create Service Token"** button (blue button, top right)
2. Fill in the form:
   - **Name:** `inspirecortex-api-access` (or `jubilee-enterprise-api`)
   - **Duration:** Select "Never" (or max duration)
   - Click **Create**

3. A popup appears with:
   - **Client ID** (copy this immediately)
   - **Client Secret** (copy this immediately)
   
   ⚠️ **WARNING**: You will NEVER see the secret again after closing this popup. Copy both values NOW.

4. After copying, click "I have saved my credentials" or "Close"

### Step 5: Provide to Me

Once you have both values, give me:

```
CF_CLIENT_ID=<the hex value here>
CF_CLIENT_SECRET=<the base64 value here>
```

Example (these are fake):
```
CF_CLIENT_ID=a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6
CF_CLIENT_SECRET=aW5zcGlyZWNvcnRleC1hcGktYWNjZXNzLXNlY3JldC10b2tlbg==
```

---

## Troubleshooting: Can't Find Service Tokens

### If you see "Access" but no submenu:

1. Make sure you're in **Cloudflare Zero Trust** (one.dash.cloudflare.com), NOT regular Cloudflare dashboard
2. Check you're in the right **account** (top left)

### If "Service Tokens" doesn't appear:

1. Try: **Access** → **Authentication** (sometimes nested differently)
2. Or look for **"Tokens"** directly in the left sidebar
3. Or search for "Service Token" using Ctrl+F on the page

### If you see "Applications" instead of "Service Tokens":

- **Applications** = web apps you're protecting (not what we want)
- **Service Tokens** = machine-to-machine tokens (what we need)
- They should be in the same Access menu

---

## What These Tokens Do

Once I have them, the server will:

1. Send these headers to https://api.inspirecortex.com:
   ```
   CF-Access-Client-Id: <your-client-id>
   CF-Access-Client-Secret: <your-client-secret>
   ```

2. This bypasses the Cloudflare Access login and goes straight through to the API

3. Image generation will work: JubileeVerse → InspireCortex GPU → back to JubileeVerse

---

## Need More Help?

If you're still stuck:
- Tell me the exact text you see in the left sidebar
- Or take a screenshot of the Access menu
- Or describe what buttons/options are visible

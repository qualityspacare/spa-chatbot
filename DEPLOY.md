# Deployment Guide — Quality Spa Care Chatbot Backend

## Files Overview

| File | Purpose |
|---|---|
| `server.js` | Main Express server — POST /predict endpoint, session memory |
| `systemPrompt.js` | All business training data fed to Claude |
| `package.json` | Node.js dependencies |
| `.env.example` | Template for your secret environment variables |
| `.gitignore` | Prevents secrets from being committed to Git |

---

## Step 1 — Test Locally First

```bash
# 1. Copy the env template
cp .env.example .env

# 2. Open .env and paste your Anthropic API key
#    ANTHROPIC_API_KEY=sk-ant-YOUR_REAL_KEY_HERE

# 3. Install dependencies
npm install

# 4. Start the server
npm start
# You should see: 🚀 Quality Spa Care Chatbot API running on port 3000

# 5. Test it with curl (in a new terminal)
curl -X POST http://localhost:3000/predict \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"test-001","message":"What are your maintenance plans?"}'
# You should get back: {"text":"..."}
```

---

## Step 2 — Push to GitHub

```bash
# In your project folder:
git init
git add .
git commit -m "Initial chatbot backend"

# Create a new repo on github.com, then:
git remote add origin https://github.com/YOUR_USERNAME/quality-spa-chatbot.git
git push -u origin main
```

---

## Step 3A — Deploy to Render (Recommended — Free Tier Available)

1. Go to **https://render.com** and sign up / log in
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub repo
4. Fill in these settings:
   - **Name:** `quality-spa-chatbot`
   - **Environment:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free (or Starter for always-on)
5. Under **"Environment Variables"**, add:
   - `ANTHROPIC_API_KEY` → your real key
   - `ALLOWED_ORIGIN` → `https://www.qualityspacare.com`
6. Click **"Create Web Service"**
7. Wait ~2 minutes — Render gives you a URL like:
   `https://quality-spa-chatbot.onrender.com`

> ⚠️ **Free Tier Note:** Render's free tier spins down after 15 minutes of inactivity. The first request after sleep takes ~30 seconds. Upgrade to Starter ($7/month) for always-on.

---

## Step 3B — Deploy to Vercel (Alternative)

Vercel is designed for frontend apps but supports Node.js serverless functions.
For a persistent Express server, **Render is easier**. But if you prefer Vercel:

1. Install Vercel CLI: `npm i -g vercel`
2. Run `vercel` in your project folder and follow prompts
3. Add environment variables in the Vercel dashboard under your project → Settings → Environment Variables

---

## Step 4 — Update Your Squarespace Widget

Once deployed, copy your Render URL and update the `APP_URL` variable in your Squarespace custom widget:

```javascript
// In your Squarespace widget code, change this:
const APP_URL = 'https://quality-spa-chatbot.onrender.com';

// The widget should call:
// POST https://quality-spa-chatbot.onrender.com/predict
// Body: { sessionId: "...", message: "..." }
// Expects: { text: "..." }
```

---

## Step 5 — Test the Live API

```bash
# Replace with your actual Render URL:
curl -X POST https://quality-spa-chatbot.onrender.com/predict \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"live-test-001","message":"Do you service Park City?"}'
```

Expected response:
```json
{"text":"Yes! Park City is one of our main service areas..."}
```

---

## Switching to Claude Sonnet (More Powerful)

In `server.js`, find this line and change the model:

```javascript
// Current (fast + cheap):
model: 'claude-haiku-4-5',

// Upgrade to (smarter, slightly slower):
model: 'claude-sonnet-4-5-20250929',
```

---

## API Reference

### `POST /predict`
**Request:**
```json
{ "sessionId": "unique-visitor-id", "message": "User's question" }
```
**Response:**
```json
{ "text": "Assistant's reply" }
```

### `POST /reset`
Clears a session's conversation history.
```json
{ "sessionId": "unique-visitor-id" }
```

### `GET /`
Health check — returns server status.

---

## Need Help?

If you run into issues deploying, feel free to come back and share the error message!

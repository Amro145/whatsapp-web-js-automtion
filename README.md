# 🏥 Pharmacy Management WhatsApp Bot

An intelligent, AI-powered WhatsApp Bot tailored specifically for pharmacies (e.g., صيدلية الشفاء). It uses the **whatsapp-web.js** engine, Google's **Gemini 2.0 Flash AI**, and **SQLite** to interact with customers, remember their conversation history natively, answer questions securely regarding stock limitations, and even process prescription images using advanced Vision AI.

## ✨ Key Features
* **Conversational Memory:** Preserves the last 10 messages of dynamic context per user dynamically through an iterative SQLite connection, behaving like a true conversational assistant.
* **AI Image Parsing (OCR):** The AI can receive physical prescription images ("Roshettas"), identify the medications, extract the doctor's name, and generate an active medical report.
* **Local Inventory Integration:** Cross-references patient requests directly with the local inventory (`pharmacy.db` / `data.json`), understanding prices, stock, and prescription rules dynamically.
* **Cost & Quota Optimizations:** Built-in safeguards that gracefully cancel API pings whenever bots hit the loop, preventing unexpected WhatsApp Web crashes. Includes a robust 429 Quota interception setup that protects the pipeline during heavy user load.
* **Graceful Session Locking:** Designed for serverless implementations. Binds cleanly against native `SIGINT` / `SIGTERM` commands to free Chromium execution locks smoothly avoiding Zombie-Node sessions.

## 🚀 Getting Started

### 1. Requirements
Ensure you have **Node.js** (v18+) and **Google Chrome** installed on your system.
*(If deploying this image via Docker, make sure you configure standard `puppeteer` variables to map locally)*.

### 2. Installation
```bash
# Clone the repository
git clone <your-repo-link>
cd study-agency-bot

# Install all necessary Node packages
npm install
```

### 3. Environment Variables
Create a root `.env` file referencing the following keys:
```env
GEMINI_API_KEY=your_gemini_api_key_here
MY_PERSONAL_NUMBER=2499xxxxxxx@c.us
```

### 4. Running the Bot
Initiate the main daemon using the predefined node command:
```bash
npm run dev
```
1. Watch the terminal.
2. A large QR Code will generate natively. 
3. Open WhatsApp on your primary phone, go to **Linked Devices**, and scan the QR Code.
4. Wait for the `✅ Logged in successfully!` badge in the terminal.

## 🛠️ Infrastructure and Tools Used
* **`whatsapp-web.js`**: Core client wrapper driving the Chromium automation and session control.
* **`sqlite3` / `sqlite`**: Secure local driver for tracking multi-user state, chat structures, and pharmaceutical stock logic.
* **`@google/generative-ai`**: Native integration to map users directly with `gemini-2.0-flash` & `startChat` methodologies.

## ⚠️ Notes for Cloudflare / Serverless Deployment
Currently, the core leverages SQLite written via `pharmacy.db`. While testing locally works flawlessly, if you attempt to launch this on **Cloudflare Durable Objects via Wrangler**, be warned that containerized structures discard SQLite files unless properly bound. It is recommended to implement Cloudflare **D1** bindings into `src/schema.js` for persistent production readiness.

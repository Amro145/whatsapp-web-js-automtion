import pkg from "whatsapp-web.js"
const { Client, LocalAuth } = pkg;
import qrcode from "qrcode-terminal";
import { setupDatabase } from "./src/schema.js";
import { getAIResponse, getAIVisionResponse } from "./src/gemini.js";


// ─── Database Setup ────────────────────────────────────────────────────────────
const db = await setupDatabase();


// ─── WhatsApp Client Setup ─────────────────────────────────────────────────────
const client = new Client({
    authStrategy: new LocalAuth(),
    authTimeoutMs: 120000,
    puppeteer: {
        headless: true,
        executablePath: '/usr/bin/google-chrome',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage'
        ]
    },
    webVersionCache: {
        type: "none"
    },
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36'
});


// ─── Graceful Shutdown (prevents Puppeteer execution context crashes on restart) ──
let isShuttingDown = false;
async function cleanup() {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log('Shutting down gracefully...');
    try { await client.destroy(); } catch (_) { }
    process.exit(0);
}
process.on('SIGINT', cleanup);
process.on('SIGUSR1', cleanup);
process.on('SIGUSR2', cleanup);


// ─── QR Code ──────────────────────────────────────────────────────────────────
client.on("qr", (qr) => {
    console.log("Scan the QR code on WhatsApp:");
    qrcode.generate(qr, { small: true });
});


// ─── Ready ────────────────────────────────────────────────────────────────────
client.on("ready", () => {
    console.log("✅ Logged in successfully!");
});


// ─── Message Handler ──────────────────────────────────────────────────────────
client.on("message", async (msg) => {
    const contact = await msg.getContact();
    const whatsappId = msg.from;
    const name = contact.pushname || contact.name || "الطالب";

    // Find or create applicant record
    let applicant = await db.get('SELECT * FROM applicants WHERE whatsapp_id = ?', [whatsappId]);
    if (!applicant) {
        await db.run(
            'INSERT INTO applicants (whatsapp_id, name, current_step) VALUES (?,?,?)',
            [whatsappId, name, 'inquiry']
        );
        applicant = await db.get('SELECT * FROM applicants WHERE whatsapp_id = ?', [whatsappId]);
        if (!applicant) {
            console.error("Failed to retrieve applicant after insert for:", whatsappId);
            return;
        }
        console.log("✅ New applicant registered:", name);
    }

    // ── Handle image/document messages ────────────────────────────────────────
    if (msg.hasMedia) {
        const media = await msg.downloadMedia();

        if (media.mimetype.startsWith('image/')) {
            console.log("Processing image for:", whatsappId);
            await msg.reply("جاري معالجة الصورة واستخراج بيانات المستند... ثواني يا غالي");

            // Call Gemini Vision — returns a parsed JSON object or null
            const docData = await getAIVisionResponse(media.data, media.mimetype);
            console.log("Extracted document data:", docData);

            if (!docData || !docData.is_valid) {
                await msg.reply("عذراً يا غالي، المستند ده ما واضح أو ما مدعوم. أرسل صورة واضحة للجواز أو الشهادة.");
                return;
            }

            // Save or verify official name against existing record
            if (!applicant.official_name) {
                await db.run(
                    'UPDATE applicants SET official_name = ? WHERE whatsapp_id = ?',
                    [docData.name, whatsappId]
                );
                await msg.reply(`✅ تم قبول ${docData.type}. سجلنا اسمك الرسمي: ${docData.name}.`);
                // Update in-memory object to keep report accurate
                applicant.official_name = docData.name;
            } else {
                const isMatch =
                    docData.name.includes(applicant.official_name) ||
                    applicant.official_name.includes(docData.name);

                if (!isMatch) {
                    await msg.reply(
                        `⚠️ عذراً يا غالي، الاسم في ${docData.type} (${docData.name}) ما مطابق لاسمك المسجل عندنا (${applicant.official_name}).`
                    );
                    return;
                }
                await msg.reply(`✅ تم مطابقة ${docData.type} بنجاح مع بياناتك.`);
            }

            // Send document report to admin
            const myNumber = process.env.MY_PERSONAL_NUMBER;
            if (!myNumber) {
                console.warn("MY_PERSONAL_NUMBER is not set in .env — skipping admin report.");
            } else {
                const report = `
📢 *تقرير مستند جديد*
👤 *اسم الطالب:* ${applicant.name}
🆔 *الاسم في المستند:* ${docData.name}
📱 *رقم التلفون:* ${whatsappId.replace('@c.us', '')}
📄 *نوع المستند:* ${docData.type}
✅ *حالة المطابقة:* بيانات متطابقة وسليمة.
                `;
                await client.sendMessage(myNumber, report);
                console.log("Admin report sent to:", myNumber);
            }

            return;
        }
    }

    // ── Handle text messages with AI ──────────────────────────────────────────
    const scholarships = await db.all('SELECT * FROM scholarships');
    const aiReply = await getAIResponse(msg.body, scholarships, applicant?.name);

    console.log("AI reply:", aiReply);
    await msg.reply(aiReply);
});


// ─── Initialize ───────────────────────────────────────────────────────────────
client.initialize();
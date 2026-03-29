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
    // 1. Self-Reply Guard
    if (msg.fromMe) return;

    const contact = await msg.getContact();
    const whatsappId = msg.from;
    const name = contact.pushname || contact.name || "العميل";

    // 2. Bot-Loop Guard
    if (name.toLowerCase().includes('bot') || msg.body.startsWith('!bot') || msg.body.startsWith('/')) {
        console.log(`Ignored possible bot message from: ${name}`);
        return;
    }

    // 3. Message Filtering (Ignore stickers, locations, reactions, etc.)
    if (msg.type !== 'chat' && msg.type !== 'image' && msg.type !== 'document') {
        console.log(`Ignored unsupported message type: ${msg.type}`);
        // Optionally reply if you want: await msg.reply("عذراً، لا أستطيع معالجة هذا النوع من الرسائل.");
        return;
    }

    // Find or create customer record
    let customer = await db.get('SELECT * FROM customers WHERE whatsapp_id = ?', [whatsappId]);
    if (!customer) {
        await db.run(
            'INSERT INTO customers (whatsapp_id, name, current_step) VALUES (?,?,?)',
            [whatsappId, name, 'inquiry']
        );
        customer = await db.get('SELECT * FROM customers WHERE whatsapp_id = ?', [whatsappId]);
        if (!customer) {
            console.error("Failed to retrieve customer after insert for:", whatsappId);
            return;
        }
        console.log("✅ New customer registered:", name);
    }

    // ── Handle image/document messages (Prescription / Roshetta) ─────────────
    if (msg.hasMedia) {
        const media = await msg.downloadMedia();

        if (media.mimetype.startsWith('image/')) {
            console.log("Analyzing prescription image for:", whatsappId);
            await msg.reply("جاري تحليل الروشتة واستخراج الأدوية... ثواني يا غالي 🔬");

            // Call Gemini Vision — returns a parsed JSON object or null
            const prescriptionData = await getAIVisionResponse(media.data, media.mimetype);
            console.log("Extracted prescription data:", prescriptionData);

            if (!prescriptionData || !prescriptionData.is_prescription || !prescriptionData.is_clear) {
                await msg.reply("عذراً يا غالي، الصورة دي ما واضحة أو ما تبدو روشتة طبية. أرسل صورة واضحة للروشتة.");
                return;
            }

            const detectedList = prescriptionData.detected_medicines?.length
                ? prescriptionData.detected_medicines.join('، ')
                : 'لا توجد أدوية مستخرجة';

            await msg.reply(
                `✅ تم تحليل الروشتة بنجاح!\n` +
                `👨‍⚕️ *الطبيب:* ${prescriptionData.doctor_name || 'غير محدد'}\n` +
                `💊 *الأدوية المطلوبة:* ${detectedList}\n\n` +
                `سنتحقق من توفر هذه الأدوية في المخزون. انتظرنا شوية يا غالي.`
            );

            // Send prescription report to admin
            const myNumber = process.env.MY_PERSONAL_NUMBER;
            if (!myNumber) {
                console.warn("MY_PERSONAL_NUMBER is not set in .env — skipping admin report.");
            } else {
                const report =
                    `📢 *تقرير روشتة جديدة*\n` +
                    `👤 *اسم العميل:* ${customer.name}\n` +
                    `💊 *الأدوية المكتشفة:* ${detectedList}\n` +
                    `📱 *رقم التلفون:* ${whatsappId.replace('@c.us', '')}\n` +
                    `👨‍⚕️ *الطبيب:* ${prescriptionData.doctor_name || 'غير محدد'}`;

                await client.sendMessage(myNumber, report);
                console.log("Admin prescription report sent to:", myNumber);
            }

            return;
        }
    }

    // ── Handle text messages with AI ──────────────────────────────────────────
    if (msg.hasMedia) {
        // Prevent audio/video messages from falling through into text prompts
        await msg.reply("عذراً، أنا حالياً بأستقبل صور الروشتات أو الرسائل النصية بس.");
        return;
    }

    const medicines = await db.all('SELECT * FROM medicines');

    // Fetch the last 10 messages for conversation memory
    const rawHistory = await db.all(
        'SELECT role, content FROM (SELECT id, role, content FROM messages WHERE whatsapp_id = ? ORDER BY id DESC LIMIT 10) ORDER BY id ASC',
        [whatsappId]
    );

    // Reply via AI with memory injected
    const aiReply = await getAIResponse(msg.body, medicines, customer?.name, rawHistory);

    // Save the conversation context to memory
    await db.run(
        'INSERT INTO messages (whatsapp_id, role, content) VALUES (?, ?, ?)',
        [whatsappId, 'user', msg.body]
    );
    await db.run(
        'INSERT INTO messages (whatsapp_id, role, content) VALUES (?, ?, ?)',
        [whatsappId, 'model', aiReply]
    );

    console.log("AI reply:", aiReply);
    await msg.reply(aiReply);
});


// ─── Initialize ───────────────────────────────────────────────────────────────
client.initialize();
import pkg from "whatsapp-web.js"
const { Client, LocalAuth } = pkg;
import qrcode from "qrcode-terminal";
import { setupDatabase } from "./src/schema.js";
import { getAIResponse, getAIVisionResponse } from "./src/gemini.js";


// setup database
const db = await setupDatabase();

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

// clean up puppeteer on exit/nodemon restart to prevent execution context destroyed
let isShuttingDown = false;
async function cleanup() {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log('Shutting down...');
    try { await client.destroy(); } catch (e) {}
    process.exit(0);
}
process.on('SIGINT', cleanup);
process.on('SIGUSR1', cleanup);
process.on('SIGUSR2', cleanup);


client.on("qr", (qr) => {
    console.log("scan the qr code on whatsapp");
    qrcode.generate(qr, { small: true });
});

client.on("ready", () => {
    console.log("✅ logged in successfully!");
});

client.on("message", async (msg) => {
    const contact = await msg.getContact();
    const whatsappId = msg.from;
    const name = contact.pushname || contact.name || "الطالب";

    // 1. Database management (find or create student)
    let applicant = await db.get('SELECT * FROM applicants WHERE whatsapp_id = ?', [whatsappId]);
    if (!applicant) {
        await db.run('INSERT INTO applicants (whatsapp_id, name, current_step) VALUES (?,?,?)', [whatsappId, name, 'inquiry']);
        applicant = await db.get('SELECT * FROM applicants WHERE whatsapp_id = ?', [whatsappId]);
        console.log("new student added");
    }

    // 2. Check: is the message an image?
    if (msg.hasMedia) {
        const media = await msg.downloadMedia();

        if (media.mimetype.startsWith('image/')) {
            console.log("processing image ...");
            // الرد الأول والوحيد قبل المعالجة
            await msg.reply("جاري معالجة الصورة واستخراج بيانات الجواز... ثواني يا غالي");
            
            // Process image via Gemini Vision
            const visionReply = await getAIVisionResponse(media.data, media.mimetype);
            console.log("visionReply", visionReply);
            
            // Send final result
            return msg.reply(visionReply); 
        }
    }

    // 3. If not an image (plain text message), generate AI text reply
    const scholarships = await db.all('SELECT * FROM scholarships');
    const aiReply = await getAIResponse(msg.body, scholarships, applicant?.name);
    
    console.log("aiReply", aiReply);
    msg.reply(aiReply);
});

client.initialize();
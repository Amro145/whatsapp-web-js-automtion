import pkg from "whatsapp-web.js"
const { Client, LocalAuth } = pkg;
import qrcode from "qrcode-terminal";
import { setupDatabase } from "./src/schema.js";
import { getAIResponse, getAIVisionResponse } from "./src/gemini.js";


// setup database
const db = await setupDatabase();


const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        executablePath: '/usr/bin/google-chrome',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
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
    console.log(`MESSAGE RECEIVED from ${contact.number} : ${msg.body}`);

    const whatsappId = msg.from;
    const name = contact.pushname || contact.name || "الطالب";

    // search the student in db and if not found create a new student
    let applicant = await db.get('SELECT * FROM applicants WHERE whatsapp_id = ?', [whatsappId]);
    if (!applicant) {
        await db.run('INSERT INTO applicants (whatsapp_id, name, current_step) VALUES (?,?,?)', [whatsappId, name, 'inquiry']);
        applicant = await db.get('SELECT * FROM applicants WHERE whatsapp_id = ?', [whatsappId]);
        console.log("new student added")
    }
    // scholarship data
    const scholarships = await db.all('SELECT * FROM scholarships');
    console.log("scholarships data ", scholarships)
    const aiReply = await getAIResponse(msg.body, scholarships, applicant?.name);
    console.log("aiReply", aiReply)
    msg.reply(aiReply);
    if (msg.hasMedia) {
        const media = await msg.downloadMedia();
        console.log("media", media)


        if(media.mimetype.startsWith('image/')){
            console.log("processing image ...")
            msg.reply("جاري معالجة الصورة ...")
            const visionReply = await getAIVisionResponse(media.data,media.mimetype);
            console.log("visionReply", visionReply)
            msg.reply(visionReply);
        }
    }
});

client.initialize();
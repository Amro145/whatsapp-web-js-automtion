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
    try { await client.destroy(); } catch (e) { }
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

    let applicant = await db.get('SELECT * FROM applicants WHERE whatsapp_id = ?', [whatsappId]);
    if (!applicant) {
        await db.run('INSERT INTO applicants (whatsapp_id, name, current_step) VALUES (?,?,?)', [whatsappId, name, 'inquiry']);
        applicant = await db.get('SELECT * FROM applicants WHERE whatsapp_id = ?', [whatsappId]);
        console.log("new student added");
    }

    // process images and Docments
    if (msg.hasMedia) {
        const media = await msg.downloadMedia();

        if (media.mimetype.startsWith('image/')) {
            console.log("processing image ...");
            await msg.reply("جاري معالجة الصورة واستخراج بيانات الجواز... ثواني يا غالي");

            // استدعاء Gemini Vision (بيرجع JSON بناءً على تعديلنا السابق)
            const docData = await getAIVisionResponse(media.data, media.mimetype);
            console.log("docData", docData);

            if (!docData || !docData.is_valid) {
                return msg.reply("عذراً يا غالي، المستند ده ما واضح أو ما مدعوم. أرسل صورة واضحة للجواز أو الشهادة.");
            }

            // logic of save and match the official name
            if (!applicant.official_name) {
                await db.run('UPDATE applicants SET official_name = ? WHERE whatsapp_id = ?', [docData.name, whatsappId]);
                await msg.reply(`✅ تم قبول ${docData.type}. سجلنا اسمك الرسمي: ${docData.name}.`);
                // update applicant object in memory to make the report correct
                applicant.official_name = docData.name;
            } else {
                const isMatch = docData.name.includes(applicant.official_name) || applicant.official_name.includes(docData.name);
                if (!isMatch) {
                    // here it is better to alert him that the name does not match instead of saying "we received it before"
                    return msg.reply(`⚠️ عذراً يا غالي، الاسم في ${docData.type} (${docData.name}) ما مطابق لاسمك المسجل عندنا (${applicant.official_name}).`);
                } else {
                    await msg.reply(`✅ تم مطابقة ${docData.type} بنجاح مع بياناتك.`);
                }
            }

            // 🚀 إرسال التقرير للمدير (رقمك الشخصي)
            const myNumber = process.env.MY_PERSONAL_NUMBER;
            const report = `
📢 *تقرير مستند جديد*
👤 *اسم الطالب:* ${applicant.name}
🆔 *الاسم في المستند:* ${docData.name}
📱 *رقم التلفون:* ${whatsappId.replace('@c.us', '')}
📄 *نوع المستند:* ${docData.type}
✅ *حالة المطابقة:* بيانات متطابقة وسليمة.
            `;

            await client.sendMessage(myNumber, report);
            console.log("report sent to", myNumber);

            // السطر ده كان فيه خطأ (ما ينفع نرسل docData لأنه Object)
            // كدة البوت حيسكت بعد ما يخلص معالجة الصورة
            return;
        }
    }

    // 3. الرد النصي الذكي (فقط لو ما كانت رسالة ميديا)
    const scholarships = await db.all('SELECT * FROM scholarships');
    const aiReply = await getAIResponse(msg.body, scholarships, applicant?.name);

    console.log("aiReply", aiReply);
    msg.reply(aiReply);
});

client.initialize();
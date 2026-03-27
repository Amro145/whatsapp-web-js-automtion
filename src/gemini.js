import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from 'dotenv';

dotenv.config();

// 1. إعداد Gemini بمفتاح الـ API
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ 
    model: "gemini-2.5-flash",     
    systemInstruction: `أنت موظف محترف في وكالة "دراسة للسودان" التعليمية. 
    مهمتك مساعدة الطلاب في الاستفسار عن المنح والتقديم لها.
    - رد بلهجة سودانية مهذبة واحترافية (أو عربية فصحى بسيطة).
    - اعتمد فقط على المعلومات التي سأزودك بها من قاعدة البيانات.
    - إذا سأل الطالب عن منحة غير موجودة، اعتذر منه بلطف وقل له سنقوم بتوفيرها قريباً.`
});

// 2. دالة توليد الرد الذكي
export async function getAIResponse(userMessage, scholarshipData) {
    try {
        // ندمج بيانات المنحة مع رسالة المستخدم عشان الـ AI يعرف يرد منها
        const prompt = `
        بيانات المنح المتاحة حالياً في الوكالة:
        ${JSON.stringify(scholarshipData)}
        
        رسالة الطالب: "${userMessage}"
        
        بناءً على البيانات أعلاه، رد على الطالب:`;

        const result = await model.generateContent(prompt);
        return result.response.text();
    } catch (error) {
        console.error("خطأ في Gemini API:", error);
        return "عذراً يا غالي، حصل ضغط شوية، ممكن ترسل رسالتك تاني؟";
    }
}
export async function getAIVisionResponse(base64Data, mimeType) {
    try {
        const imagePart = {
            inlineData: {
                data: base64Data,
                mimeType: mimeType
            }
        };

        const prompt = "حلل هذه الصورة. إذا كانت جواز سفر، استخرج (الاسم الكامل، رقم الجواز، تاريخ الميلاد، تاريخ الانتهاء). إذا لم تكن مستنداً رسمياً، أخبر المستخدم بذلك بلطف.";

        const result = await model.generateContent([prompt, imagePart]);
        return result.response.text();
    } catch (error) {
        console.error("خطأ في رؤية Gemini:", error);
        return "حصلت مشكلة وأنا بحاول أقرأ الصورة، تأكد إنها واضحة وأرسلها تاني.";
    }
}
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from 'dotenv';

dotenv.config();

// 1. Setup Gemini with API key
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: `أنت موظف محترف في وكالة "دراسة للسودان" التعليمية. 
    مهمتك مساعدة الطلاب في الاستفسار عن المنح والتقديم لها.
    - رد بلهجة سودانية مهذبة واحترافية (أو عربية فصحى بسيطة).
    - اعتمد فقط على المعلومات التي سأزودك بها من قاعدة البيانات.
    - إذا سأل الطالب عن منحة غير موجودة، اعتذر منه بلطف وقل له سنقوم بتوفيرها قريباً.`
});

// 2. Generate AI text reply
export async function getAIResponse(userMessage, scholarshipData) {
    try {
        // Merge scholarship data with user message so the AI can answer from it
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

// 3. Analyze image via Gemini Vision
export async function getAIVisionResponse(base64Data, mimeType) {
    try {
        const imagePart = {
            inlineData: {
                data: base64Data,
                mimeType: mimeType
            }
        };
        const prompt = `حلل هذه الصورة واستخرج البيانات ككائن JSON فقط:
        {
          "type": "passport" أو "high_school_certificate" أو "birth_certificate",
          "name": "الاسم الكامل المكتوب في المستند",
          "birth_date": "تاريخ الميلاد إن وجد",
          "is_valid": true/false
        }
        - إذا كان المستند غير واضح أو غير مدعوم اجعل is_valid: false.
        - تأكد من استخراج الاسم بدقة كما هو مكتوب.`;
        
        const result = await model.generateContent([prompt, imagePart]);
        return result.response.text();
    } catch (error) {
        console.error("خطأ في رؤية Gemini:", error);
        return "حصلت مشكلة وأنا بحاول أقرأ الصورة، تأكد إنها واضحة وأرسلها تاني.";
    }
}
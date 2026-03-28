import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from 'dotenv';

dotenv.config();

// Initialize Gemini with API key
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: `أنت موظف محترف في وكالة "دراسة للسودان" التعليمية. 
    مهمتك مساعدة الطلاب في الاستفسار عن المنح والتقديم لها.
    - رد بلهجة سودانية مهذبة واحترافية (أو عربية فصحى بسيطة).
    - اعتمد فقط على المعلومات التي سأزودك بها من قاعدة البيانات.
    - إذا سأل الطالب عن منحة غير موجودة، اعتذر منه بلطف وقل له سنقوم بتوفيرها قريباً.`
});

// Generate AI text reply
export async function getAIResponse(userMessage, scholarshipData, applicantName) {
    try {
        const prompt = `
        بيانات المنح المتاحة حالياً في الوكالة:
        ${JSON.stringify(scholarshipData)}
        
        اسم الطالب: ${applicantName || 'غير معروف'}
        رسالة الطالب: "${userMessage}"
        
        بناءً على البيانات أعلاه، رد على الطالب:`;

        const result = await model.generateContent(prompt);
        return result.response.text();
    } catch (error) {
        console.error("Gemini API error:", error);
        return "عذراً يا غالي، حصل ضغط شوية، ممكن ترسل رسالتك تاني؟";
    }
}

// Analyze image via Gemini Vision and return parsed JSON object
export async function getAIVisionResponse(base64Data, mimeType) {
    try {
        const imagePart = {
            inlineData: {
                data: base64Data,
                mimeType: mimeType
            }
        };

        const prompt = `حلل هذه الصورة واستخرج البيانات ككائن JSON فقط بدون أي نص إضافي:
        {
          "type": "passport" أو "high_school_certificate" أو "birth_certificate",
          "name": "الاسم الكامل المكتوب في المستند",
          "birth_date": "تاريخ الميلاد إن وجد",
          "is_valid": true/false
        }
        - إذا كان المستند غير واضح أو غير مدعوم اجعل is_valid: false.
        - تأكد من استخراج الاسم بدقة كما هو مكتوب.
        - أرجع JSON فقط بدون markdown أو backticks.`;

        const result = await model.generateContent([prompt, imagePart]);
        const rawText = result.response.text().trim();

        // Strip markdown code fences if Gemini wraps the JSON
        const jsonText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

        return JSON.parse(jsonText);
    } catch (error) {
        console.error("Gemini Vision error:", error);
        return null;
    }
}
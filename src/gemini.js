import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from 'dotenv';

dotenv.config();

// Initialize Gemini with API key
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: `أنت صيدلاني محترف في صيدلية "الشفاء". 
    مهمتك مساعدة العملاء في الاستفسار عن الأدوية المتوفرة وأسعارها.
    - رد بلهجة سودانية مهذبة وودودة (أو عربية فصحى بسيطة).
    - اعتمد فقط على بيانات الأدوية التي سأزودك بها من قاعدة البيانات.
    - إذا سأل العميل عن دواء غير موجود في المخزون، اعتذر منه بلطف وقل له سنقوم بتوفيره قريباً.
    - إذا كان الدواء يحتاج روشتة طبية، نبّه العميل لإحضار الروشتة قبل الصرف.
    - لا تقدم نصائح طبية خارج نطاق بيانات الأدوية المتاحة.`
});

// Generate AI text reply
export async function getAIResponse(userMessage, medicineData, customerName) {
    try {
        const prompt = `
        بيانات الأدوية المتوفرة حالياً في الصيدلية:
        ${JSON.stringify(medicineData)}
        
        اسم العميل: ${customerName || 'عميلنا العزيز'}
        رسالة العميل: "${userMessage}"
        
        بناءً على البيانات أعلاه، رد على العميل:`;

        const result = await model.generateContent(prompt);
        return result.response.text();
    } catch (error) {
        console.error("Gemini API error:", error);
        return "عذراً يا غالي، حصل ضغط شوية، ممكن ترسل رسالتك تاني؟";
    }
}

// Analyze a prescription (Roshetta) image via Gemini Vision — returns parsed JSON or null
export async function getAIVisionResponse(base64Data, mimeType) {
    try {
        const imagePart = {
            inlineData: {
                data: base64Data,
                mimeType: mimeType
            }
        };

        const prompt = `حلل هذه الصورة وحدد إذا كانت روشتة طبية، ثم استخرج البيانات ككائن JSON فقط بدون أي نص إضافي:
        {
          "is_prescription": true/false,
          "detected_medicines": ["اسم الدواء 1", "اسم الدواء 2"],
          "doctor_name": "اسم الطبيب إن وجد",
          "is_clear": true/false
        }
        - إذا كانت الصورة غير واضحة أو ليست روشتة، اجعل is_prescription: false و is_clear: false.
        - استخرج أسماء الأدوية كما هي مكتوبة في الروشتة.
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
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
    headless: true, 
    executablePath: '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
});

const page = (await browser.pages())[0];

console.log('Opening WhatsApp Web...');
await page.goto('https://web.whatsapp.com', {
    waitUntil: 'networkidle2',
    timeout: 60000,
    referer: 'https://whatsapp.com/'
});

console.log('Page loaded. Final URL:', page.url());

// Check various WA internals
const checks = await page.evaluate(() => {
    return {
        debugVersion: window.Debug?.VERSION,
        hasRequire: typeof window.require,
        windowKeys: Object.keys(window).filter(k => k.startsWith('WA') || k.startsWith('wa')).slice(0, 20),
        hasWWebJS: typeof window.WWebJS,
        requireExists: typeof window.require !== 'undefined',
    };
}).catch(e => `eval error: ${e.message}`);

console.log('WA Checks:', JSON.stringify(checks, null, 2));
await browser.close();

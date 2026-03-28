import sqlite3 from 'sqlite3';
import { open } from 'sqlite';


// Open connection to SQLite database
export async function setupDatabase() {
    const db = await open({
        filename: './agency.db',
        driver: sqlite3.Database
    });

    // Create scholarships table
    await db.exec(`
       CREATE TABLE IF NOT EXISTS scholarships (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                university TEXT,
                country TEXT,
                details TEXT,
                requirements TEXT
            )
        `);

    // Create applicants table
    await db.exec(`
            CREATE TABLE IF NOT EXISTS applicants (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                whatsapp_id TEXT UNIQUE,
                name TEXT,
                official_name TEXT,
                current_step TEXT DEFAULT 'inquiry',
                docs_status TEXT DEFAULT 'none',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

    // Migrate: add official_name column if it doesn't exist (for existing databases)
    try {
        await db.exec(`ALTER TABLE applicants ADD COLUMN official_name TEXT`);
    } catch (_) {
        // Column already exists, ignore
    }

    // Seed sample scholarship data if table is empty
    const { count } = await db.get('SELECT COUNT(*) as count FROM scholarships');
    if (count === 0) {
        await db.run(`
                INSERT INTO scholarships (university, country, details, requirements)
                VALUES (
                    'HSE University', 
                    'روسيا', 
                    'منحة دراسية كاملة تغطي الرسوم الدراسية وتوفر سكناً جامعياً في موسكو.', 
                    'جواز سفر ساري المفعول، الشهادة السودانية، وصورة شخصية.'
                )
            `);
        console.log('✅ Sample scholarship added.');
    }

    console.log('✅ Database is ready.');

    return db;
}

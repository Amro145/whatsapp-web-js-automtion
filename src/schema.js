import sqlite3 from 'sqlite3';
import { open } from 'sqlite';


// connection between nodejs and sqlite
export async function setupDatabase() {
    const db = await open({
        filename: './agency.db',
        driver: sqlite3.Database
    });

    // create Tables
    // scholarships table
    await db.exec(`
       CREATE TABLE IF NOT EXISTS scholarships (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                university TEXT,
                country TEXT,
                details TEXT,
                requirements TEXT
            )
        `);
    // users table
    await db.exec(`
            CREATE TABLE IF NOT EXISTS applicants (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                whatsapp_id TEXT UNIQUE,
                name TEXT,
                current_step TEXT DEFAULT 'inquiry',
                docs_status TEXT DEFAULT 'none',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

    // add sample data
    const scholarshipCount = await db.get('SELECT COUNT(*) as count FROM scholarships');
    if (scholarshipCount.count === 0) {
        await db.run(`
                INSERT INTO scholarships (university, country, details, requirements)
                VALUES (
                    'HSE University', 
                    'روسيا', 
                    'منحة دراسية كاملة تغطي الرسوم الدراسية وتوفر سكناً جامعياً في موسكو.', 
                    'جواز سفر ساري المفعول، الشهادة السودانية، وصورة شخصية.'
                )
            `);
        console.log("added scholarship")
    }

    console.log('✅ database is ready in ES Modules');

    return db;
}

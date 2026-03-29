import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const seedMedicines = require('../data.json');


// Open connection to SQLite database
export async function setupDatabase() {
    const db = await open({
        filename: './pharmacy.db',
        driver: sqlite3.Database
    });

    // Create medicines table
    await db.exec(`
        CREATE TABLE IF NOT EXISTS medicines (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            trade_name TEXT NOT NULL,
            generic_name TEXT,
            price REAL NOT NULL DEFAULT 0,
            stock_quantity INTEGER NOT NULL DEFAULT 0,
            category TEXT,
            prescription_required INTEGER NOT NULL DEFAULT 0
        )
    `);

    // Create customers table
    await db.exec(`
        CREATE TABLE IF NOT EXISTS customers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            whatsapp_id TEXT UNIQUE,
            name TEXT,
            current_step TEXT DEFAULT 'inquiry',
            docs_status TEXT DEFAULT 'none',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Create messages table to store conversation history
    await db.exec(`
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            whatsapp_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Seed medicine data from data.json if table is empty
    const { count } = await db.get('SELECT COUNT(*) as count FROM medicines');
    if (count === 0) {
        const stmt = await db.prepare(
            'INSERT INTO medicines (trade_name, generic_name, price, stock_quantity, category, prescription_required) VALUES (?, ?, ?, ?, ?, ?)'
        );
        for (const medicine of seedMedicines) {
            await stmt.run([
                medicine.trade_name,
                medicine.generic_name,
                medicine.price,
                medicine.stock_quantity,
                medicine.category,
                medicine.prescription_required ? 1 : 0
            ]);
        }
        await stmt.finalize();
        console.log(`✅ ${seedMedicines.length} medicines seeded from data.json.`);
    }

    console.log('✅ Database is ready.');

    return db;
}

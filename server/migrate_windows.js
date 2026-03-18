
import sqlite3 from 'sqlite3';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dbPath = join(__dirname, 'quizmaker.db');

const db = new sqlite3.Database(dbPath);

async function migrate() {
    console.log('--- Starting Password Migration ---');
    
    const getUsers = () => new Promise((resolve, reject) => {
        db.all('SELECT id, username, password_hash FROM users', (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });

    const updateUser = (id, hash) => new Promise((resolve, reject) => {
        db.run('UPDATE users SET password_hash = ? WHERE id = ?', [hash, id], (err) => {
            if (err) reject(err);
            else resolve();
        });
    });

    try {
        const users = await getUsers();
        console.log(`Found ${users.length} users to check.`);

        for (const user of users) {
            // Check if it's already a bcrypt hash (bcrypt hashes usually start with $2a$ or $2b$)
            if (user.password_hash && (user.password_hash.startsWith('$2a$') || user.password_hash.startsWith('$2b$'))) {
                console.log(`- Skipping ${user.username} (already hashed)`);
                continue;
            }

            console.log(`- Migrating ${user.username}...`);
            const salt = await bcrypt.genSalt(10);
            const hash = await bcrypt.hash(user.password_hash || 'password', salt);
            await updateUser(user.id, hash);
        }

        console.log('--- Migration Successful! ---');
        console.log('You can now log in with your original passwords.');
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        db.close();
    }
}

migrate();

const { createDatabase, ACCOUNTS } = require('./database.cjs');

function createLocalStore(directory) {
    const base = createDatabase(directory);
    const { db } = base;
    const read = name => base.read(name);
    const write = (name, value) => base.write(name, value);
    return {
        db,
        ready: async () => {},
        close: () => base.close(),
        async setupDone() { return db.prepare("SELECT COUNT(*) count FROM users WHERE digest<>''").get().count === 3; },
        async getUser(username) { return db.prepare('SELECT * FROM users WHERE username=?').get(username) || null; },
        async setInitialUsers(users) {
            return base.transaction(() => {
                if (db.prepare("SELECT COUNT(*) count FROM users WHERE digest<>''").get().count === 3) throw Object.assign(new Error('As senhas iniciais já foram definidas.'), { status: 403 });
                for (const user of users) db.prepare('UPDATE users SET salt=?,digest=? WHERE username=?').run(user.salt, user.digest, user.username);
            });
        },
        async updateUser(username, values) { db.prepare('UPDATE users SET salt=?,digest=? WHERE username=?').run(values.salt, values.digest, username); },
        async getSession(token) { return db.prepare('SELECT sessions.*,users.role FROM sessions JOIN users USING(username) WHERE token=? AND expires>?').get(token, Date.now()) || null; },
        async createSession(record) { db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(record.token, record.username, record.csrf, record.expires); },
        async deleteSession(token) { db.prepare('DELETE FROM sessions WHERE token=?').run(token); },
        async deleteUserSessions(username) { db.prepare('DELETE FROM sessions WHERE username=?').run(username); },
        async clearExpiredSessions() { db.prepare('DELETE FROM sessions WHERE expires<=?').run(Date.now()); },
        async read(name) { return read(name); },
        async getBackup(role) { const row = db.prepare('SELECT value FROM backups WHERE role=? ORDER BY id DESC LIMIT 1').get(role); return row ? JSON.parse(row.value) : null; },
        async transaction(work) {
            db.exec('BEGIN IMMEDIATE');
            try {
                const result = await work({
                read,
                write,
                addBackup(role, value) { db.prepare('INSERT INTO backups(role,created,value) VALUES(?,?,?)').run(role, new Date().toISOString(), JSON.stringify(value)); },
                hasMigration(name) { return !!db.prepare('SELECT name FROM migrations WHERE name=?').get(name); },
                addMigration(name) { db.prepare('INSERT INTO migrations VALUES(?,?)').run(name, new Date().toISOString()); },
                updateUser(username, values) { db.prepare('UPDATE users SET salt=?,digest=? WHERE username=?').run(values.salt, values.digest, username); },
                deleteUserSessions(username) { db.prepare('DELETE FROM sessions WHERE username=?').run(username); },
                setupDone() { return db.prepare("SELECT COUNT(*) count FROM users WHERE digest<>''").get().count === 3; },
                setInitialUsers(users) { for (const user of users) db.prepare('UPDATE users SET salt=?,digest=? WHERE username=?').run(user.salt, user.digest, user.username); },
                });
                db.exec('COMMIT');
                return result;
            } catch (err) {
                db.exec('ROLLBACK');
                throw err;
            }
        },
    };
}

module.exports = { createLocalStore, ACCOUNTS };

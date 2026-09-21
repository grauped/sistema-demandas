const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const C = require('./contracts-core.js');
const P = require('./access-policy.js');
const ACCOUNTS = Object.freeze({gestora:'secretaria03.grautecnico@gmail.com',exatas:'pedagogico04.grautecnico@gmail.com',saude:'pedagogico05.grautecnico@gmail.com'});
function createDatabase(directory) {
    fs.mkdirSync(directory, { recursive: true });
    const db = new DatabaseSync(path.join(directory, 'sistema.sqlite'));
    db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
        CREATE TABLE IF NOT EXISTS users (username TEXT PRIMARY KEY, role TEXT NOT NULL UNIQUE, salt TEXT NOT NULL, digest TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, username TEXT NOT NULL REFERENCES users(username), csrf TEXT NOT NULL, expires INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS state (name TEXT PRIMARY KEY, value TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE IF NOT EXISTS backups (id INTEGER PRIMARY KEY, role TEXT NOT NULL, created TEXT NOT NULL, value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY, created TEXT NOT NULL);
    `);
    for(const [role,email] of Object.entries(ACCOUNTS))db.prepare('INSERT OR IGNORE INTO users VALUES(?,?,?,?)').run(email,role,'','');
    const insert = db.prepare('INSERT OR IGNORE INTO state(name,value,revision) VALUES(?,?,0)');
    insert.run('contracts', JSON.stringify(P.normalize(C.empty())));insert.run('tasks', '[]');
    function read(name) { const row=db.prepare('SELECT value,revision FROM state WHERE name=?').get(name);return {data:JSON.parse(row.value),revision:row.revision}; }
    function write(name,value) {db.prepare('UPDATE state SET value=?,revision=revision+1 WHERE name=?').run(JSON.stringify(value),name);return read(name).revision;}
    function transaction(fn){db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}}
    return {db,read,write,transaction,close:()=>db.close()};
}
const digest = token => crypto.createHash('sha256').update(token).digest('hex');
async function passwordHash(password,salt=crypto.randomBytes(16).toString('hex')) {
    const value=await new Promise((resolve,reject)=>crypto.scrypt(password,salt,64,(err,key)=>err?reject(err):resolve(key)));
    return {salt,digest:value.toString('hex')};
}
async function passwordMatches(password,user){const hash=await passwordHash(password,user?.salt||'missing-user-timing-padding');return !!user&&user.digest.length===hash.digest.length&&crypto.timingSafeEqual(Buffer.from(user.digest,'hex'),Buffer.from(hash.digest,'hex'));}
module.exports={createDatabase,passwordHash,passwordMatches,digest,ACCOUNTS};

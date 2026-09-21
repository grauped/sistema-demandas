const { ACCOUNTS } = require('./database.cjs');
const C = require('./contracts-core.js');
const P = require('./access-policy.js');

function firestoreError(message) { return Object.assign(new Error(message), { status: 500 }); }

function createFirestoreStore() {
    let admin;
    try { admin = require('firebase-admin'); } catch { throw firestoreError('A dependência firebase-admin não está instalada.'); }
    const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!encoded) throw firestoreError('A variável FIREBASE_SERVICE_ACCOUNT_JSON não foi configurada.');
    let credentials;
    try { credentials = JSON.parse(encoded); } catch { throw firestoreError('FIREBASE_SERVICE_ACCOUNT_JSON não contém um JSON válido.'); }
    if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(credentials) });
    const db = admin.firestore();
    const ref = (collection, id) => db.collection(collection).doc(id);
    const parseState = snapshot => {
        if (!snapshot.exists) throw firestoreError('O estado do sistema não foi inicializado.');
        const value = snapshot.data();
        return { data: value.data, revision: value.revision };
    };
    async function ready() {
        await db.runTransaction(async transaction => {
            const userRefs = Object.entries(ACCOUNTS).map(([role, username]) => ({ role, username, ref: ref('users', username) }));
            const stateRefs = [
                { name: 'contracts', data: P.normalize(C.empty()) },
                { name: 'tasks', data: [] },
            ].map(item => ({ ...item, ref: ref('state', item.name) }));
            const snapshots = await Promise.all([...userRefs.map(item => transaction.get(item.ref)), ...stateRefs.map(item => transaction.get(item.ref))]);
            userRefs.forEach((item, index) => { if (!snapshots[index].exists) transaction.create(item.ref, { username: item.username, role: item.role, salt: '', digest: '' }); });
            stateRefs.forEach((item, index) => { if (!snapshots[userRefs.length + index].exists) transaction.create(item.ref, { data: item.data, revision: 0 }); });
        });
    }
    function transactionContext(transaction) {
        const stateCache = new Map();
        return {
            async read(name) {
                if (stateCache.has(name)) return stateCache.get(name);
                const value = parseState(await transaction.get(ref('state', name)));
                stateCache.set(name, value);
                return value;
            },
            async write(name, data) {
                const current = await this.read(name);
                const revision = current.revision + 1;
                transaction.set(ref('state', name), { data, revision });
                stateCache.set(name, { data, revision });
                return revision;
            },
            async addBackup(role, value) { transaction.create(db.collection('backups').doc(), { role, created: new Date().toISOString(), value }); },
            async hasMigration(name) { return (await transaction.get(ref('migrations', name))).exists; },
            async addMigration(name) { transaction.create(ref('migrations', name), { created: new Date().toISOString() }); },
            async updateUser(username, values) { transaction.update(ref('users', username), values); },
            async deleteUserSessions(username) {
                const sessions = await transaction.get(db.collection('sessions').where('username', '==', username));
                sessions.docs.forEach(item => transaction.delete(item.ref));
            },
            async setupDone() {
                const users = await Promise.all(Object.values(ACCOUNTS).map(username => transaction.get(ref('users', username))));
                return users.every(item => item.exists && item.data().digest);
            },
            async setInitialUsers(users) { users.forEach(user => transaction.update(ref('users', user.username), { salt: user.salt, digest: user.digest })); },
        };
    }
    return {
        ready,
        async setupDone() { const users = await Promise.all(Object.values(ACCOUNTS).map(username => ref('users', username).get())); return users.every(item => item.exists && item.data().digest); },
        async getUser(username) { const snapshot = await ref('users', username).get(); return snapshot.exists ? snapshot.data() : null; },
        async updateUser(username, values) { await ref('users', username).update(values); },
        async getSession(token) {
            const snapshot = await ref('sessions', token).get();
            if (!snapshot.exists || snapshot.data().expires <= Date.now()) return null;
            const item = snapshot.data(), user = await ref('users', item.username).get();
            return user.exists ? { ...item, role: user.data().role } : null;
        },
        async createSession(record) { await ref('sessions', record.token).create(record); },
        async deleteSession(token) { await ref('sessions', token).delete(); },
        async deleteUserSessions(username) {
            const records = await db.collection('sessions').where('username', '==', username).get();
            const batch = db.batch(); records.docs.forEach(item => batch.delete(item.ref)); await batch.commit();
        },
        async clearExpiredSessions() {
            const records = await db.collection('sessions').where('expires', '<=', Date.now()).get();
            const batch = db.batch(); records.docs.forEach(item => batch.delete(item.ref)); await batch.commit();
        },
        async read(name) { return parseState(await ref('state', name).get()); },
        async getBackup(role) { const records = await db.collection('backups').where('role', '==', role).orderBy('created', 'desc').limit(1).get(); return records.empty ? null : records.docs[0].data().value; },
        async importLocalDatabase(localDb) {
            const users = localDb.prepare('SELECT username,role,salt,digest FROM users').all();
            const states = localDb.prepare('SELECT name,value,revision FROM state').all().map(item => ({ ...item, data: JSON.parse(item.value) }));
            const backups = localDb.prepare('SELECT role,created,value FROM backups').all().map(item => ({ ...item, value: JSON.parse(item.value) }));
            const migrations = localDb.prepare('SELECT name,created FROM migrations').all();
            await db.runTransaction(async transaction => {
                const cloudStates = await Promise.all(states.map(item => transaction.get(ref('state', item.name))));
                const hasRecords = cloudStates.some(item => item.exists && ((item.data().revision || 0) > 0 || (Array.isArray(item.data().data) ? item.data().data.length : item.data().data.contracts.length || item.data().data.instructors.length)));
                const cloudUsers = await Promise.all(users.map(item => transaction.get(ref('users', item.username))));
                if (hasRecords || cloudUsers.some(item => item.exists && item.data().digest)) throw firestoreError('O Firestore já contém dados ou senhas. A migração foi cancelada para evitar sobreposição.');
                users.forEach(item => transaction.set(ref('users', item.username), item));
                states.forEach(item => transaction.set(ref('state', item.name), { data: item.data, revision: item.revision }));
                backups.forEach(item => transaction.create(db.collection('backups').doc(), item));
                migrations.forEach(item => transaction.set(ref('migrations', item.name), item));
            });
        },        async transaction(work) { return db.runTransaction(async transaction => work(transactionContext(transaction))); },
    };
}

module.exports = { createFirestoreStore };

const path = require('node:path');
const { createDatabase } = require('../database.cjs');
const { createFirestoreStore } = require('../firestore-store.cjs');
async function main() {
    const directory = path.resolve(process.argv[2] || path.join(__dirname, '..', 'data'));
    const local = createDatabase(directory);
    try { const cloud = createFirestoreStore(); await cloud.importLocalDatabase(local.db); console.log('Migração concluída. Confira os registros no Firebase antes de publicar.'); }
    finally { local.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });

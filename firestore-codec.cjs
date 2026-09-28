const { gzipSync, gunzipSync } = require('node:zlib');

// Keep large histories below Firestore's per-document limit. Old documents remain readable.
function pack(value, field = 'data') {
    const json = JSON.stringify(value);
    if (Buffer.byteLength(json) < 500000) return { [field]: value };
    const encoded = gzipSync(Buffer.from(json)).toString('base64');
    if (Buffer.byteLength(encoded) > 900000) throw new Error('O histórico excedeu a capacidade de armazenamento. Nenhuma alteração foi salva.');
    return { [field + 'Gzip']: encoded };
}
function unpack(record, field = 'data') {
    if (Object.hasOwn(record, field + 'Gzip')) {
        return JSON.parse(gunzipSync(Buffer.from(record[field + 'Gzip'], 'base64'), { maxOutputLength: 32 * 1024 * 1024 }).toString('utf8'));
    }
    return record[field];
}
module.exports = { pack, unpack };

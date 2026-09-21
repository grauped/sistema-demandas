const { createFirestoreStore } = require('../firestore-store.cjs');
const { createAPI } = require('../api.cjs');
let api;
async function application() {
    if (!api) { const store = createFirestoreStore(); await store.ready(); api = createAPI(store); }
    return api;
}
module.exports = async (req, res) => {
    const original = req.query?.path ? `/api/${req.query.path}` : new URL(req.url, `https://${req.headers.host}`).pathname;
    await (await application()).handle(req, res, original);
};

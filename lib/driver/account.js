const request = require('./request');

async function fingerprints (keyid) {
    const r = await request.get(`/admin/account/${keyid}`);
    return r;
}

async function login (fingerprint) {
    return await request.post(`/admin/account/login?fingerprint=${fingerprint}`,);
}

async function info () {
    return await request.get('/api/account/ticket/object');
}

async function remove () {

}

async function allow () {

}

async function _requests () {

}

module.exports = {
    fingerprints,
    login,
    info,
    remove,
    allow,
    requests: _requests,
};
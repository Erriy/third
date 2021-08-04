const request = require('./request');

async function fingerprints (keyid) {
    const r = await request.get(`/admin/account/fingerprint?keyid=${keyid}`);
    return r;
}

async function login (fingerprint) {
    return await request.post(`/admin/account/login?fingerprint=${fingerprint}`,);
}

async function info () {
    return await request.get('/api/account/ticket/object');
}

async function remove_device (fingerprint) {

}

async function add_device (fingerprint) {
    return await request.put(`/admin/account/device/${fingerprint}`);
}

async function _requests () {
    return await request.get('/admin/account/request');
}

module.exports = {
    fingerprints,
    login,
    info,
    device: {
        add   : add_device,
        remove: remove_device,
    },
    requests: _requests,
};
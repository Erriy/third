const request = require('./request');

async function create ({port, relay}) {
    return await request.put('/admin/relay', {port, relay});
}

async function remove (port) {
    return await request.delete(`/admin/relay/${port}`);
}

async function list () {
    return await request.get('/admin/relay');
}

async function get (port) {
    return await request.get(`/admin/relay/${port}`);
}

module.exports = {
    create,
    remove,
    list,
    get,
};
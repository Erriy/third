const request = require('./request');

async function create ({port, relay}) {
    return await request.put('/local/relay', {port, relay});
}

async function remove (port) {
    return await request.delete(`/local/relay/${port}`);
}

async function list () {
    return await request.get('/local/relay');
}

async function get (port) {
    return await request.get(`/local/relay/${port}`);
}

module.exports = {
    create,
    remove,
    list,
    get,
};
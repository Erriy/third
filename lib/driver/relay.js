const request = require('./request');

async function create ({port, relay}) {
    return await request.put('/local/relay', {port, relay});
}

async function remove () {

}

async function list () {
    return await request.get('/local/relay');
}

module.exports = {
    create,
    remove,
    list,
};
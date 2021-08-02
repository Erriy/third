const request = require('./request');
const relay = require('./relay');
const account = require('./account');

function init ({
    port = 34105,
    host = '127.0.0.1',
    url = 'http://127.0.0.1:34105/'
} = {}) {
    request.init({port, host, url});
}

module.exports = {
    init,
    relay,
    account,
};
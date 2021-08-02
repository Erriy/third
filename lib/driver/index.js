const request = require('./request');
const relay = require('./relay');
const account = require('./account');

function init ({
    port = 34105
} = {}) {
    request.init({port});
}

module.exports = {
    init,
    relay,
    account,
};
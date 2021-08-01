const request = require('./request');
const relay = require('./relay');

function init ({
    port = 34105
} = {}) {
    request.init({port});
}

module.exports = {
    init,
    relay,
};
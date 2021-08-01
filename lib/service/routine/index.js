const runtime = require('./runtime');
const aes256 = require('./aes256');
const pubkey = require('./pubkey');

async function init ({
    root = null,
    port = 34105,
    bootstrap = [],
    relay = null,
} = {}) {
    await runtime.init({root, relay});
}

module.exports = {
    init,
    runtime,
    aes256,
    pubkey,
};
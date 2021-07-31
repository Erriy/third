const runtime = require('./runtime');
const aes256 = require('./aes256');

async function init ({
    root = null,
    port = 34105,
    bootstrap = [],
    relay = null,
} = {}) {
    await runtime.init({root});
}

module.exports = {
    init,
    runtime,
    aes256,
};
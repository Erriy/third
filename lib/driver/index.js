const runtime = require('./runtime');
const key = require('./key');
const relay = require('./relay');

async function init () {
    await runtime.init();
}

module.exports = {
    init,
    key,
    relay,
};
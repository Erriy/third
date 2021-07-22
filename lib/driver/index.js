const runtime = require('./runtime');
const key = require('./key');
const relay = require('./relay');
const ticket = require('./ticket');

async function init () {
    await runtime.init();
}

module.exports = {
    init,
    key,
    relay,
    ticket,
};
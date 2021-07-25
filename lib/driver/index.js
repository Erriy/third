const runtime = require('./runtime');
const key = require('./key');
const relay = require('./relay');
const ticket = require('./ticket');
const message = require('./message');
const account = require('./account');

async function init () {
    await runtime.init();
}

module.exports = {
    init,
    key,
    relay,
    ticket,
    message,
    account,
};
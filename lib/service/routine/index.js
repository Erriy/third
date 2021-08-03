const runtime = require('./runtime');
const aes256 = require('./aes256');
const ticket = require('./ticket');
const account = require('./account');
const mdns = require('./mdns');

async function init ({
    root = null,
    port = 34105,
    bootstrap = [],
    relay = null,
    provider = false,
} = {}) {
    await runtime.init({root, relay, bootstrap, port});
    await ticket.init({provider});
    await account.init();
    await mdns.init();
}

module.exports = {
    init,
    runtime,
    aes256,
    ticket,
    account,
};
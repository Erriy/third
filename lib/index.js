const runtime = require('./runtime');
const kns = require('./kns');
const rpc = require('./rpc');
const service = require('./service');
const account = require('./account');
const {client: relay_client} = require('./relay');

async function init ({
    database = null,
    port = 34105,
    bootstrap = [],
    mdns = true,
    provider = false,
    relay = null,
    logger = console,
    enable_relay = false,
} = {}) {
    await runtime.init({database, port, logger});
    await kns.init({bootstrap, provider, mdns});
    await service.init({enable_relay,});
    await account.init();
    if(relay) {
        if(!relay.endsWith('/')){
            relay += '/';
        }
        new relay_client(port, relay);
    }
}

module.exports = {
    init,
    get rpc () {
        return {
            regist: rpc.regist,
            invoke: rpc.invoke,
        };
    },
    runtime,
    get account () {
        return {
            lookup     : account.lookup,
            login      : account.login,
            logout     : account.logout,
            device     : account.device,
            request    : account.request,
            status     : account.status,
            fingerprint: account.fingerprint,
            have_prikey: account.have_prikey,
        };
    },
};
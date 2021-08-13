const runtime = require('./runtime');
const kns = require('./kns');
const rpc = require('./rpc');
const service = require('./service');
const account = require('./account');

async function init ({
    database = null,
    port = 34105,
    bootstrap = [],
    mdns = true,
    provider = false,
    logger = console
} = {}) {
    await runtime.init({database, port, logger});
    await kns.init({bootstrap, provider, mdns});
    await service.init();
    await account.init();
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
            fingerprint: account.fingerprint
        };
    },
};
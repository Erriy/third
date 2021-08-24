const runtime = require('./runtime');
const kns = require('./kns');
const rpc = require('./rpc');
const server = require('./server');
const account = require('./account');
const {client: relay_client} = require('./relay');

async function init ({
    database = null,
    port = 34105,
    bootstrap = [],
    relay = null,
    logger = console,
    service = {
        mdns : true,
        kns  : false,
        relay: false,
    },
} = {}) {
    logger.info('[engine.init] 引擎初始化开始');
    await runtime.init({database, port, logger});
    await kns.init({bootstrap, provider: service.kns, mdns: service.mdns});
    await rpc.init();
    await server.init({enable_relay: service.relay,});
    await account.init();
    if(relay) {
        if(!relay.endsWith('/')){
            relay += '/';
        }
        new relay_client(port, relay);
    }
    logger.info('[engine.init] 引擎初始化完成');
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
    get kns () {
        return {
            store   : kns.store,
            get     : kns.get,
            local   : kns.local,
            lookup  : kns.lookup,
            analysis: kns.analysis,
            publish : kns.publish,
            merge   : kns.merge,
            record  : kns.record,
        };
    },
};
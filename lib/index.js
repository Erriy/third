const runtime = require('./runtime');
const kns = require('./kns');
const rpc = require('./rpc');
const service = require('./service');

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
}

function create () {

}

function login () {

}

/**
 * 注册处理函数
 * @param {string} name - 要处理的事件
 * @param {rpc_handler_callback} callback - 处理函数
 */
function handle (name, callback) {
    rpc.regist(name, callback);
}

module.exports = {
    init,
    get rpc () {
        return {
            handle,
            invoke: rpc.invoke,
        };
    },
    runtime,
};
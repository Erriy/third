const express = require('express');
const http = require('http');
const {server: relay_router, client: relay_client} = require('./relay');
const api_router = require('./api');
const local_router = require('./local');
const runtime = require('./runtime');
const ticket = require('./ticket');
const pubkey = require('./pubkey');
const message = require('./message');
const kv = require('./kv');
const account = require('./account');
const clipboard = require('./clipboard');

const obj = {
    /**
     * @type {http.Server}
     */
    server: null,
};

async function start ({
    port = 34105,
    bootstrap = [],
    relay = undefined,
    enable_clipboard = false,
} = {}) {
    await runtime.init();
    await kv.init();
    await ticket.init({bootstrap});
    await pubkey.init();
    await message.init();
    await account.init();
    if(enable_clipboard) {
        await clipboard.init();
    }

    if(relay) {
        const rc = new relay_client(port, relay);
        rc.on('connected', async ()=>{
            ticket.ticket.service.add('third', rc.relay);
            await ticket.publish();
        });
    }

    const app = express();
    const server = http.createServer(app);

    app.use((req, res, next) => {
        res.build = (obj = {})=>{
            obj.code = obj.code || 200;
            obj.message = obj.message || '操作成功';
            let data = JSON.stringify(obj);
            return res.status(obj.code).send(data);
        };
        next();
    });

    app.use('/local', await local_router(server));
    app.use('/api', await api_router(server, {enable_clipboard}));
    app.use('/relay', await relay_router(server));

    server.listen(port, '0.0.0.0');
    obj.server = server;
}

module.exports = {
    start,
};

const express = require('express');
const http = require('http');
const relay_router = require('./relay');
const api_router = require('./api');
const local_router = require('./local');

const obj = {
    /**
     * @type {http.Server}
     */
    server: null,
};

async function start ({
    port = 34105
} = {}) {
    const app = express();
    const server = http.createServer(app);

    app.use((req, res, next) => {
        res.build = (obj = {})=>{
            // 返回数据自动加密
            obj.code = obj.code || 200;
            obj.message = obj.message || '操作成功';
            let data = JSON.stringify(obj);
            return res.status(obj.code).send(data);
        };
        next();
    });

    app.use('/local', local_router(server));
    app.use('/api', await api_router(server));
    app.use('/relay', await relay_router(server));

    server.listen(port, '0.0.0.0');
    obj.server = server;
}

module.exports = {
    start,
};

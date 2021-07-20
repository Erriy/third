const express = require('express');
const http = require('http');
const key_router = require('./key');

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

    app.use('/api/key', await key_router());

    obj.server = http.createServer(app);
    obj.server.listen(port);
}

module.exports = {
    start,
};

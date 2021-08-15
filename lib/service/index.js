const express = require('express');
const http = require('http');
const runtime = require('../runtime');
const kns = require('./kns');
const rpc = require('./rpc');
const {router: relay_router} = require('../relay');

async function init ({
    enable_relay = false,
} = {}) {

    // 创建服务实例
    const app = express();
    const server = http.createServer(app);

    server.on('request', (request, response) => {
        runtime.logger.info('[i]', request.socket.remoteAddress, request.method, request.originalUrl);
    });

    return new Promise((resolve, reject) => {
        const failed_return = (e)=> {
            let msg = e.message;
            if(e.syscall === 'listen' && e.code === 'EADDRINUSE') {
                msg = '端口被占用，无法启动服务';
                runtime.logger.error('[!]', msg);
            }
            else {
                runtime.logger.error(e);
            }
            return reject(msg);
        };
        server.on('error', failed_return);

        server.listen(runtime.port, '0.0.0.0', async ()=>{
            // 添加通用返回代码
            app.use((req, res, next) => {
                res.build = (obj = {})=>{
                    obj.code = obj.code || 200;
                    obj.message = obj.message || '操作成功';
                    let data = JSON.stringify(obj);
                    return res.status(obj.code).send(data);
                };
                next();
            });

            // 添加路由
            app.use('/kns', kns());
            app.use('/rpc', rpc());
            if(enable_relay) {
                app.use('/relay', await relay_router(server));
            }

            runtime.logger.info('[*] 服务已启动');
            server.removeListener('error', failed_return);
            return resolve();
        });

    });
}

module.exports = {
    init,
};
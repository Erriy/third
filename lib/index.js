const express = require('express');
const http = require('http');
const api_router = require('./api');
const {router: relay_router, client: relay_client} = require('./relay');
const routine = require('./routine');

/**
 * 启动本地服务
 * @param {Object} option - 选项
 * @param {string|null} [option.root=null] - 服务运行的根目录，默认在'~/.third/'
 * @param {number} [option.port=34105] - 服务端口
 * @param {Array|string} [option.bootstrap=[]] - 使用的ticket服务地址启动节点，优先查询和提交
 * @param {string|null} [option.relay=null] - 使用的中继服务地址，默认不使用中继
 * @param {Boolean} [option.provider=false] - 提供ticket存储查询服务
 * @param {Array} [option.service=[]] - 指定选择性启动的服务
 *
 * 'api' 启动对外api服务
 *
 * 'relay' 启动relay服务
 */
function start ({
    root = null,
    port = 34105,
    bootstrap = [],
    relay = null,
    provider = false,
    service = [],
} = {}) {

    // 创建服务实例
    const app = express();
    const server = http.createServer(app);

    server.on('request', (request, response) => {
        console.log('[i]', new Date(), request.socket.remoteAddress, request.method, request.originalUrl);
    });
    return new Promise((resolve, reject) => {
        const failed_return = (e)=> {
            let msg = e.message;
            if(e.syscall === 'listen' && e.code === 'EADDRINUSE') {
                msg = '端口被占用，无法启动服务';
                console.error('[!]', msg);
            }
            else {
                console.log(e);
            }
            return reject(msg);
        };
        server.on('error', failed_return);

        server.listen(port, '0.0.0.0', async ()=>{
        // 公用代码初始化
            await routine.init({root, bootstrap, port, relay, provider});

            // 连接中继服务
            if(relay) {
                if(!relay.endsWith('/')){
                    relay += '/';
                }
                const rc = new relay_client(port, relay);
                rc.on('connected', async ()=>{
                    routine.ticket.ticket.service = rc.relay;
                    await routine.ticket.publish();
                });
            }

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
            const routers = {
                api  : api_router,
                relay: relay_router
            };
            for(let s of Array.from(new Set(service))) {
                if(routers[s]) {
                    app.use('/' + s, await routers[s](server));
                }
            }
            console.log('[*] 服务已启动');
            server.removeListener('error', failed_return);
            return resolve();
        });

    });
}

module.exports = {
    start,
    routine,
};
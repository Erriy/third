const express = require('express');
const http = require('http');
const api_router = require('./api');
const local_router = require('./local');
const {router: relay_router} = require('./relay');
const routine = require('./routine');

/**
 * 启动本地服务
 * @param {Object} option - 选项
 * @param {string|null} [option.root=null] - 服务运行的根目录，默认在'~/.third/'
 * @param {number} [option.port=34105] - 服务端口
 * @param {Array|string} [option.bootstrap=[]] - 使用的ticket服务地址启动节点，优先查询和提交
 * @param {string|null} [option.relay=null] - 使用的中继服务地址，默认不使用中继
 * @param {Array} [option.service=[]] - 指定选择性启动的服务
 *
 * 'api' 启动对外api服务
 *
 * 'relay' 启动relay服务
 *
 * 'local' 本地控制服务
 */
async function start ({
    root = null,
    port = 34105,
    bootstrap = [],
    relay = null,
    service = [],
} = {}) {
    // 公用代码初始化
    await routine.init({root, bootstrap, port, relay});
    // 创建服务实例
    const app = express();
    const server = http.createServer(app);

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
        local: local_router,
        api  : api_router,
        relay: relay_router
    };
    for(let s of Array.from(new Set(service))) {
        if(routers[s]) {
            app.use('/' + s, await routers[s](server));
        }
    }
    // 启动服务
    server.listen(port, '0.0.0.0');
}

module.exports = {
    start,
};
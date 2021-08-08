const axios = require('axios').default;
const urljoin = require('url-join');
const ticket = require('./ticket');

class session {
    constructor (fingerprint) {
        this.fingerprint = fingerprint;
    }

    static async select (fingerprint) {
        // todo 保存到数据库，超时session自动删除
        // todo 通信全部加密
        const that = new this(fingerprint);
        return that;
    }

    async request (method, path, data = undefined) {
        const headers = {};
        if(typeof data === 'string') {
            headers['Content-Type'] = 'text/plain';
        }
        const t = await ticket.get(this.fingerprint, {discover: true, refresh: false});
        if(!t) {
            throw new Error('对端尚未加入third网络');
        }
        method = method.toLowerCase();

        // 先尝试本地连接，如果失败，则再进行中继连接
        if(t.local_service) {
            try {
                const r = await axios({
                    method,
                    url    : urljoin(t.local_service, path),
                    data,
                    timeout: 1000,
                    headers,
                });
                return r.data;
            }
            catch(e) {
                if(e.response) {
                    return e.response.data;
                }
            }
        }
        // 尝试中继连接
        const object = JSON.parse(t.text);
        const service = object.service;
        if(!service) {
            throw new Error('对方未暴露服务地址');
        }
        try {
            const r = await axios({
                method,
                url    : urljoin(service, path),
                data,
                timeout: 5000,
                headers,
            });
        }
        catch(e) {
            if(e.response) {
                return e.response.data;
            }
            throw new Error('无法建立有效连接');
        }
    }

    async get (path) {
        return await this.request('get', path);
    }

    async put (path, data) {
        return await this.request('put', path, data);
    }

    async post (path, data) {
        return await this.request('post', path, data);
    }

    async delete (path, data) {
        return await this.request('delete', path, data);
    }

    async patch (path, data) {
        return await this.request('patch', path, data);
    }
}

module.exports = session;

const axios = require('axios').default;
const urljoin = require('url-join');

const obj = {
    url_prefix: null,
};

function init ({port, host, url}) {
    obj.url_prefix = url || `http://${host}:${port}`;
}

async function do_request (method, path, data) {
    try {
        const r = await axios({
            method: method.toUpperCase(),
            url   : urljoin(obj.url_prefix, path),
            data
        });
        return r.data;
    }
    catch (e) {
        if(!e.response) {
            console.error(`连接服务(${obj.url_prefix})失败，请确认主机/地址是否正确`);
            process.exit(-1);
        }
        return e.response.data;
    }
}

async function get (path, data) {
    return await do_request('get', path, data);
}

async function put (path, data) {
    return await do_request('put', path, data);
}

async function post (path, data) {
    return await do_request('post', path, data);
}

async function _delete (path, data) {
    return await do_request('delete', path, data);
}

async function patch (path, data) {
    return await do_request('patch', path, data);
}

module.exports = {
    init,
    get,
    put,
    post,
    patch,
    delete: _delete,
    do    : do_request,
};
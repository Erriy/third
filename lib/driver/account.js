const axios = require('axios').default;
const runtime = require('./runtime');

async function set_ticket (ticket) {
    try {
        const resp = await axios.put(runtime.url('local/account/ticket'), ticket);
        return resp.data;
    }
    catch(e) {
        return e.response.data;
    }
}

async function login_require (fingerprint) {
    try {
        const resp = await axios.post(runtime.url(`local/account/login?fingerprint=${fingerprint}`));
        return resp.data;
    }
    catch(e) {
        return e.response.data;
    }
}

async function get_login_request () {
    try {
        const resp = await axios.get(runtime.url('local/account/request'));
        return resp.data;
    }
    catch(e) {
        return e.response.data;
    }
}

async function get_object () {
    try {
        const resp = await axios.get(runtime.url('local/account/object'));
        return resp.data;
    }
    catch(e) {
        return e.response.data;
    }
}

module.exports = {
    set_ticket,
    login_require,
    get_login_request,
    get_object,
};

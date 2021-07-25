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

module.exports = {
    set_ticket,
};

const axios = require('axios').default;
const runtime = require('./runtime');

async function list () {
    const resp = await axios.get(runtime.url('local/relay'));
    return resp.data.list;
}

async function create (port, relay) {
    const resp = await axios.put(runtime.url('local/relay'), {port, relay});
    return resp.data;
}

async function remove ({port, relay}) {
    const resp = await axios.delete(runtime.url(`local/relay?port=${port ? port : ''}&relay=${relay ? relay : ''}`));
    return resp.data;
}

module.exports = {
    list,
    create,
    remove
};

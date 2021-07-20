const axios = require('axios').default;
const runtime = require('./runtime');

async function fingerprint () {
    const resp = await axios.get(runtime.url('api/key/fingerprint'));
    return resp.data.fingerprint;
}

module.exports = {
    fingerprint,
};

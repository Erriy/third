const default_gateway = require('default-gateway');
const multicast_dns = require('multicast-dns');
const os = require('os');
const axios = require('axios').default;
const urljoin = require('url-join');
const ticket = require('./ticket');

const obj = {
    /**
     * @type {multicast_dns}
     */
    mdns      : null,
    /**
     * @type {Object.<string, {third: string, pubkey: string}>}
     */
    device_map: {}
};

async function init (port = 34105) {
    let ipv4 = null;
    const { interface: iface } = await default_gateway.v4();
    const interfaces = os.networkInterfaces();
    for (let i of interfaces[iface]) {
        if ('IPv4' === i.family) {
            ipv4 = i.address;
        }
    }

    obj.mdns = multicast_dns({
        multicast: true, // use udp multicasting
        port     : 5353, // set the udp port
        ip       : '224.0.0.251', // set the udp ip
        ttl      : 255, // set the multicast ttl
        loopback : true, // receive your own packets
        reuseAddr: true // set the reuseAddr option when creating the socket (requires node >=0.11.13)
    });

    obj.mdns.on('response', async response=>{
        const ans = response.answers.filter(a=>(a.name === 'third.local' && a.type === 'SRV'));
        if(ans.length === 0) {
            return;
        }
        await Promise.all(ans.map(async a=>{
            const third_service = `http://${a.data.target}:${a.data.port}`;
            const ticket_url = urljoin(third_service, 'api/ticket');
            try {
                const resp = await axios.get(ticket_url, {timeout: 1000});
                const r = await ticket.analysis(resp.data.ticket);
                obj.device_map[r.fingerprint] = {
                    third : third_service,
                    pubkey: r.pubkey
                };
            }
            catch(e) {}
        }));
    });

    obj.mdns.on('query', query=>{
        if(query.questions.filter(q=>(q.name === 'third.local' && q.type === 'SRV')).length === 0) {
            return;
        }

        obj.mdns.respond([{
            name: 'third.local',
            type: 'SRV',
            data: {
                port,
                target: ipv4
            }
        }]);
    });

    obj.mdns.query([{name: 'third.local', type: 'SRV'}]);
    setInterval(()=>{
        obj.mdns.query([{name: 'third.local', type: 'SRV'}]);
    }, 1000 * 60 * 5);
}

function get (fingerprint) {
    return obj.device_map[fingerprint];
}

module.exports = {
    init,
    get,
};
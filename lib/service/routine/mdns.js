const multicast_dns = require('multicast-dns');
const axios = require('axios').default;
const urljoin = require('url-join');
const ticket = require('./ticket');
const runtime = require('./runtime');

const obj = {
    /**
     * @type {multicast_dns}
     */
    mdns: null,
};

async function init () {
    obj.mdns = multicast_dns({
        multicast: true, // use udp multicasting
        port     : 5353, // set the udp port
        ip       : '224.0.0.251', // set the udp ip
        ttl      : 255, // set the multicast ttl
        loopback : true, // receive your own packets
        reuseAddr: true // set the reuseAddr option when creating the socket (requires node >=0.11.13)
    });

    // 记录内网响应的数据
    obj.mdns.on('response', async response=>{
        const ans = response.answers.filter(a=>(a.name === 'third.local' && a.type === 'SRV'));
        if(ans.length === 0) {
            return;
        }
        await Promise.all(ans.map(async a=>{
            const third_service = `http://${a.data.target}:${a.data.port}`;
            try {
                // 保存设备ticket
                const resp = await axios.get(urljoin(third_service, 'api/ticket'), {timeout: 2000});
                await ticket.store(resp.data.ticket, third_service);
            }
            catch(e) {
                return;
            }
            try {
                // 保存 account ticket
                const resp = await axios.get(urljoin(third_service, 'api/account/ticket'), {timeout: 2000});
                await ticket.store(resp.data.ticket);
            }
            catch(e) {}
        }));
    });

    // 查询的响应
    obj.mdns.on('query', async query=>{
        if(query.questions.filter(q=>(q.name === 'third.local' && q.type === 'SRV')).length === 0) {
            return;
        }
        obj.mdns.respond([{
            name: 'third.local',
            type: 'SRV',
            data: {
                port  : runtime.port,
                target: await runtime.ipv4()
            }
        }]);
    });

    // 启动时即请求一次，然后定期请求
    obj.mdns.query([{name: 'third.local', type: 'SRV'}]);
    setInterval(()=>{
        obj.mdns.query([{name: 'third.local', type: 'SRV'}]);
    }, 1000 * 60 * 5);
}

module.exports = {
    init,
};
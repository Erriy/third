const multicast_dns = require('multicast-dns');
const axios = require('axios').default;
const urljoin = require('url-join');
const openpgp = require('openpgp');
const runtime = require('./runtime');
const os = require('os');

const obj = {
    /**
     * @type {multicast_dns}
     */
    mdns     : null,
    bootstrap: [],
    /**
     * @type {record}
     */
    record   : null,
};

class record {
    #service = null;
    #name = null;
    #changed = true;
    #timeout = 1000 * 60 * 10;
    #created = 0;
    #key = {};
    #signed = null;
    #provider = false;

    constructor (key, name) {
        this.#key = key;
        this.#name = name || (os.hostname() + (process.env.DEBUG ? '.debug' : ''));
    }

    set timeout (value) {
        if(typeof value !== 'number') {
            throw new Error('timeout 必须为number类型');
        }
        this.#timeout = value;
    }

    get service () {
        return this.#service;
    }

    set service (value) {
        this.#service = value;
        this.#changed = true;
    }

    get provider () {
        return this.#provider;
    }

    set provider (value) {
        this.#provider = value;
        this.#changed = true;
    }

    async valueOf () {
        if(!this.#signed || this.#changed || new Date().getTime() / 1000 - this.#created > 1000 * 60 * 2) {
            this.#signed = await openpgp.sign({
                message: await openpgp.createCleartextMessage({
                    text: JSON.stringify({
                        service : this.#service || `http://${await runtime.ipv4()}:${runtime.port}/`,
                        name    : this.#name,
                        provider: this.#provider || undefined,
                        expire  : new Date().getTime() / 1000 + this.#timeout
                    })
                }),
                signingKeys: this.#key,
                config     : {
                    preferredHashAlgorithm: openpgp.enums.hash.sha512
                }
            });
            this.#changed = false;
            this.#created = new Date().getTime() / 1000;
            await store({
                pubkey: this.#key.toPublic().armor(),
                signed: this.#signed
            });
        }
        return {
            pubkey: this.#key.toPublic().armor(),
            signed: this.#signed
        };
    }

    async toString () {
        return JSON.stringify(await this.valueOf());
    }
}

/**
 * 分析、验证record数据
 * @param {string|{pubkey: string, signed: string}} r - record 数据
 * @returns {Promise<{fingerprint: string, expire: number, created: number, text: string, pubkey:string, signature: string, provider: boolean}>}
 */
async function analysis (r) {
    // todo 检查kns provider是否可用，如果不可用，则throw
    if(typeof r === 'string') {
        r = JSON.parse(r);
    }

    const pubkey = await openpgp.readKey({ armoredKey: r.pubkey});
    const verified = await openpgp.verify({
        message: await openpgp.readCleartextMessage({
            cleartextMessage: r.signed
        }),
        date            : new Date(Date.now() + 1000 * 5), // 允许5秒误差
        verificationKeys: pubkey,
    });
    const sign = verified.signatures[0];

    if (!(await sign.verified)) {
        throw new Error('签名无效');
    }

    const signature = (await sign.signature).armor();
    const obj = JSON.parse(verified.data);
    const fingerprint = pubkey.getFingerprint().toUpperCase();
    const created = new Date(
        verified.signatures[0].signature.packets[0].created
    ).getTime() / 1000;
    // 默认5分钟超时
    // 最多保存5分钟，超时后即删除，模仿watchdog操作，客户端通过提交来保证自己在线
    let expire = created + 1000 * 60 * 5;
    if(obj.expire) {
        try {
            const oexp = new Date(obj.expire * 1000);
            // 如果record.expire 在五分钟以内超时，则使用record.expire的超时时间
            if(oexp.getTime() / 1000 < expire) {
                expire = oexp.getTime() / 1000;
            }
        }
        catch(e) {
            throw new Error('expire 格式不正确');
        }
    }
    // 拒绝保存过期record，防止有旧record中的key丢失后被恶意利用
    if(expire < new Date().getTime() / 1000) {
        throw new Error('record 已经过期');
    }

    return {
        fingerprint,
        expire,
        created,
        signature,
        text    : verified.data,
        pubkey  : r.pubkey,
        provider: obj.provider || false
    };
}

function merge (r) {
    return {
        pubkey: r.pubkey,
        signed: '-----BEGIN PGP SIGNED MESSAGE-----\n'
                + 'Hash: SHA512\n\n'
                + r.text + '\n'
                + r.signature,
    };
}

async function find_neighbor (fingerprint) {
    return await runtime.db.all(`
        select * from (
            select * from record
            where fingerprint<=$fingerprint and provider=true
            order by fingerprint desc
            limit $radius
        )
        union
        select * from (
            select * from record
            where fingerprint>=$fingerprint and provider=true
            order by fingerprint asc
            limit $radius
        )
    `, {$fingerprint: fingerprint, $radius: 5});
}

async function neighbor (fingerprint) {
    return (await find_neighbor(fingerprint)).map(r=>(
        merge(r.text, r.signature, r.pubkey)
    ));
}

async function dynamic_lookup_neighbor (fingerprint, callback) {
    const history_set = new Set(); // 记录已经请求过的服务
    let services = obj.bootstrap;
    let loop_flag = true;
    while(loop_flag && services.length > 0) {
        await Promise.all(services.map(async s=>{
            // todo 查询等待时间，找到立即返回
            let stop_signal = callback(s);
            if(stop_signal instanceof Promise) {
                await stop_signal;
            }
            if(stop_signal) {
                loop_flag = false;
                return;
            }
            try {
                const r = await axios.get(urljoin(s, 'kns/record', fingerprint, 'neighbor'));
                for(let record of r.data.list) {
                    await store(record);
                }
            }
            catch(e) {}
            history_set.add(s);
        }));

        const nearest_services = (await find_neighbor(fingerprint)).map(r=>(JSON.parse(r.text).service));
        services = Array.from(new Set(nearest_services.filter(s=>!history_set.has(s))));
    }
}

async function store (record, local_service = undefined) {
    if(typeof record === 'string') {
        record = JSON.parse(record);
    }

    // 分析是否存储
    const d = await analysis(record);
    // todo 优化成单次操作
    // 如果已有的数据更新，则拒绝保存
    const old = await runtime.db.get(
        'select * from record where fingerprint = ?',
        d.fingerprint
    );
    if(old && old.created > d.created) {
        return;
    }
    // 保存数据
    if(undefined === local_service) {
        await runtime.db.run(`
            replace into record(
                fingerprint, text, provider, signature, created, expire, pubkey
            ) values (?,?,?,?,?,?,?)
        `,
        d.fingerprint,
        d.text,
        d.provider,
        d.signature,
        d.created,
        d.expire,
        d.pubkey,
        );
    }
    else {
        await runtime.db.run(`
            replace into record(
                fingerprint, text, provider, signature, created, expire, pubkey, local_service
            ) values (?,?,?,?,?,?,?,?)
        `,
        d.fingerprint,
        d.text,
        d.provider,
        d.signature,
        d.created,
        d.expire,
        d.pubkey,
        local_service,
        );
    }
}

async function clear_local_service (fingerprint) {
    await runtime.db.run('update record set local_service=null where fingerprint=?', fingerprint);
}

/**
 * 根据指纹获取record
 * @param {string} fingerprint - 要获取的record的证书指纹
 * @param {object} option
 * @param {boolean} [option.discover=false] - 如果本地不存在则进行自动发现
 * @param {boolean} [option.refresh=false] - 如果为true，则删除本地数据
 * @returns {Promise<null|{fingerprint: string, text: string, provider: boolean, signature: string, pubkey: string, created: number, expire: number, local_service: null|string}>}
 */
async function get (fingerprint, {
    discover = false,
    refresh = false,
} = {}) {
    let record = null;
    fingerprint = fingerprint.toUpperCase();

    const get_from_db = async ()=>{
        const r = await runtime.db.get('select * from record where fingerprint = ?', fingerprint);

        if(r) {
            return {
                fingerprint  : r.fingerprint,
                text         : r.text,
                provider     : r.provider,
                signature    : r.signature,
                pubkey       : r.pubkey,
                created      : r.created,
                expire       : r.expire,
                local_service: r.local_service,
            };
        }
        return null;
    };

    // 刷新缓存
    if(refresh) {
        await runtime.db.run('delete from record where fingerprint = ?', fingerprint);
    }
    // 不刷新缓存
    else {
        record = await get_from_db();
    }

    // 自动发现
    if(!record && discover) {
        await dynamic_lookup_neighbor(
            fingerprint,
            async (s)=>{
                try {
                    // 向服务端查询是否有ticket
                    const r = await axios.get(urljoin(s, 'kns/record', fingerprint));
                    await store(r.data.record);
                    record = await get_from_db();
                    return true;
                }
                catch(e) {}
            },
        );
    }

    return record;
}

/**
 * 根据keyid查询指纹
 * @param {string} keyid
 * @returns {string}
 */
async function lookup (keyid) {
    const r = await runtime.db.get('select fingerprint from record where fingerprint like ? limit 1', '%' + keyid.replace('0x', ''));
    return r ? r.fingerprint : null;
}

/**
 * 发布到kns网络
 * @param {string|Object} r - 需要发布的record
 */
async function publish (r) {
    r = r || await obj.record.valueOf();
    if('string' === typeof r) {
        r = JSON.parse(r);
    }
    const fpr = runtime.key.getFingerprint().toUpperCase();
    await dynamic_lookup_neighbor(fpr, async (s)=>{
        try {
            await axios.put(urljoin(s, 'kns/record'), r);
        }
        catch(e) {}
    });
}

async function init_mdns () {
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
                const resp = await axios.get(urljoin(third_service, 'kns/record'), {timeout: 1000});
                // 保存设备record
                if(resp.data.device) {
                    await store(resp.data.device, third_service);
                }
                // 保存设备中的账户record
                if(resp.data.account) {
                    await store(resp.data.account);
                }
            }
            catch(e) {
                return;
            }
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

async function init ({
    provider = false,
    mdns = true,
    bootstrap = [],
} = {}) {
    obj.bootstrap = bootstrap;

    // 建表
    await runtime.db.run(`
        create table if not exists record (
            fingerprint text primary key, -- 指纹
            text text not null, -- record 携带的实际内容，被签名的实际内容
            provider boolean default false, -- 提供kns服务
            signature text not null, -- 签名数据
            pubkey text not null, -- 公钥信息
            created number not null, -- record 的创建时间，只保存最新的record，旧的record无法覆盖新的数据
            expire number not null, -- 超时自动删除，默认保存5分钟
            local_service text default null -- mdns发现的本地服务地址
        )
    `);

    // 创建本机的ticket对象
    obj.record = new record(runtime.key);
    obj.record.provider = provider;

    // 启动内网mdns服务
    if(mdns) {
        await init_mdns();
    }

    // 自动删除超时数据
    const auto_delete = async ()=>{
        await runtime.db.run(`
            delete from record where expire < ?
        `, new Date().getTime() / 1000);
    };
    setImmediate(auto_delete);
    setInterval(auto_delete, 1000 * 60);

    // 自动发布托管ticket
    setImmediate(publish);
    setInterval(publish, 1000 * 60);

    runtime.on('relay.connected', async (rc)=>{
        obj.record.service = rc.relay;
        await publish();
    });
}

module.exports = {
    init,
    store,
    get,
    lookup,
    analysis,
    neighbor,
    publish,
    merge,
    clear_local_service,
    get record () {
        return obj.record;
    }
};

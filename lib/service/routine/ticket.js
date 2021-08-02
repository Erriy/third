const openpgp = require('openpgp');
const axios = require('axios').default;
const urljoin = require('url-join');
const runtime = require('./runtime');

const obj = {
    ticket: null,
};

class ticket {
    #service = null;
    #changed = true;
    #timeout = 1000 * 60 * 10;
    #created = 0;
    #key = {};
    #signed = null;
    #provider = false;

    constructor (key) {
        this.#key = key;
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
 * 分析、验证ticket数据
 * @param {string|{pubkey: string, signed: string}} t - ticket 数据
 * @returns {Promise<{fingerprint: string, expire: number, created: number, text: string, pubkey:string, signature: string, provider: boolean}>}
 */
async function analysis (t) {
    // todo 检查ticket服务是否可用，如果ticket服务不可用，则throw
    if(typeof t === 'string') {
        t = JSON.parse(t);
    }

    const pubkey = await openpgp.readKey({ armoredKey: t.pubkey});
    const verified = await openpgp.verify({
        message: await openpgp.readCleartextMessage({
            cleartextMessage: t.signed
        }),
        date            : new Date(Date.now() + 1000),
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
            const oexp = new Date(obj.expire);
            // 如果ticket.expire 在五分钟以内超时，则使用ticket.expire的超时时间
            if(oexp.getTime() / 1000 < expire) {
                expire = oexp.getTime() / 1000;
            }
        }
        catch(e) {
            throw new Error('expire 格式不正确');
        }
    }
    // 拒绝保存过期ticket，防止有旧ticket中的key丢失后被恶意利用
    if(expire < new Date().getTime() / 1000) {
        throw new Error('ticket 已经过期');
    }

    return {
        fingerprint,
        expire,
        created,
        signature,
        text    : verified.data,
        pubkey  : t.pubkey,
        provider: obj.provider || false
    };
}

async function merge_ticket (text, signature, pubkey) {
    return {
        pubkey,
        signed: '-----BEGIN PGP SIGNED MESSAGE-----\n'
                + 'Hash: SHA512\n\n'
                + text + '\n'
                + signature,
    };
}

/**
 * 存储
 * @param  {...(string|{pubkey: string, signed: string})} ts
 */
async function store (...ts) {
    for(let t of ts) {
        if(typeof t === 'string') {
            t = JSON.parse(t);
        }

        try {
            // 分析是否存储
            const d = await analysis(t);
            // todo 优化成单次操作
            // 如果已有的数据更新，则拒绝保存
            const old = await runtime.db.get(
                'select * from ticket where fingerprint = ?',
                d.fingerprint
            );
            if(old && old.created > d.created) {
                continue;
            }
            // 保存数据
            await runtime.db.run(`
                replace into ticket(
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
        catch(e) {}
    }
}

async function find_neighbor (fingerprint) {
    return await runtime.db.all(`
        select * from (
            select * from ticket
            where fingerprint<=$fingerprint and provider=true
            order by fingerprint desc
            limit $radius
        )
        union
        select * from (
            select * from ticket
            where fingerprint>=$fingerprint and provider=true
            order by fingerprint asc
            limit $radius
        )
    `, {$fingerprint: fingerprint, $radius: 5});
}

async function neighbor (fingerprint) {
    return (await find_neighbor(fingerprint)).map(t=>(
        merge_ticket(t.text, t.signature, t.pubkey)
    ));
}

async function dynamic_lookup_neighbor (fingerprint, callback, stop = ()=>(false)) {
    const history_set = new Set(); // 记录已经请求过的服务
    let services = runtime.bootstrap;
    let loop_flag = true;
    while(loop_flag && services.length > 0) {
        await Promise.all(services.map(async s=>{
            const call = callback(s);
            if(call instanceof Promise) {
                await call;
            }
            const stop_signal = stop();
            if(stop_signal instanceof Promise ? await stop_signal : stop_signal) {
                loop_flag = false;
                return;
            }
            try {
                const r = await axios.get(urljoin(s, 'api/ticket', fingerprint, 'neighbor'));
                await store(... r.data.list);
            }
            catch(e) {}
            history_set.add(s);
        }));

        const nearest_services = (await find_neighbor(fingerprint)).map(t=>(JSON.parse(t.text).service));
        services = Array.from(new Set(nearest_services.filter(s=>!history_set.has(s))));
    }
}

/**
 * 根据指纹获取ticket
 * @param {string} fingerprint - 要获取的ticket的证书指纹
 * @param {object} option
 * @param {boolean} [option.discover=false] - 如果本地不存在则进行自动发现
 * @param {boolean} [option.refresh=false] - 如果为true，则删除本地数据
 * @returns {Promise<null|string>}
 */
async function get (fingerprint, {
    discover = false,
    refresh = false,
} = {}) {
    let t = null;
    fingerprint = fingerprint.toUpperCase();

    const get_from_db = async ()=>{
        const r = await runtime.db.get('select * from ticket where fingerprint = ?', fingerprint);
        return r ? r.ticket : null;
    };

    // 刷新缓存
    if(refresh) {
        await runtime.db.run('delete from ticket where fingerprint = ?', fingerprint);
    }
    // 不刷新缓存
    else {
        t = await get_from_db();
    }

    // 自动发现
    if(discover) {
        await dynamic_lookup_neighbor(
            fingerprint,
            async (s)=>{
                try {
                    // 向服务端查询是否有ticket
                    const r = await axios.get(urljoin(s, 'api/ticket', fingerprint));
                    await store(r.data.ticket);
                }
                catch(e) {}
            },
            // 如果发现退出lookup
            async ()=>{
                t = await get_from_db();
                return t;
            }
        );
    }

    return t;
}

/**
 * 发布到ticket网络
 * @param {string|Object} t - 需要发布的ticket
 */
async function publish (t) {
    t = t || await obj.ticket.valueOf();
    if('string' === typeof t) {
        t = JSON.parse(t);
    }
    const fpr = runtime.key.getFingerprint().toUpperCase();
    await dynamic_lookup_neighbor(fpr, async (s)=>{
        try {
            await axios.put(urljoin(s, 'api/ticket'), t);
        }
        catch(e) {}
    });
}

async function init ({
    provider = false
} = {}) {
    // 建表
    await runtime.db.run(`
        create table if not exists ticket (
            fingerprint text primary key, -- 指纹
            text text not null, -- ticket 携带的实际内容，被签名的实际内容
            provider boolean default false, -- 提供ticket查询服务
            signature text not null, -- 签名数据
            pubkey text not null, -- 公钥信息
            created number not null, -- ticket 的创建时间，只保存最新的ticket，旧的ticket无法覆盖新的数据
            expire number not null -- 超时自动删除，默认保存5分钟
        )
    `);

    // 创建本机的ticket对象
    obj.ticket = new ticket(runtime.key);
    obj.ticket.provider = provider;

    // 自动删除超时数据
    const auto_delete = async ()=>{
        runtime.db.run(`
            delete from ticket where expire < ?
        `, new Date().getTime() / 1000);
    };
    await auto_delete();
    setInterval(auto_delete, 1000 * 60);

    // 自动发布托管ticket
    setInterval(publish, 1000 * 60);
}

module.exports = {
    init,
    store,
    get,
    analysis,
    neighbor,
    publish,
    /**
     * @returns {ticket}
     */
    get ticket () {
        return obj.ticket;
    },
};
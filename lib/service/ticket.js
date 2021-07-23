const axios = require('axios').default;
const urljoin = require('url-join');
const openpgp = require('openpgp');
const runtime = require('./runtime');

const obj = {
    /**
     * @type{ticket}
     */
    ticket   : null,
    bootstrap: [],
};

class ticket {
    #service = {};
    #changed = true;
    #timeout = 1000 * 60 * 10;
    #created = 0;
    #key = {};
    #signed = null;

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
        const that = this;
        return {
            add (name, service) {
                that.#changed = true;
                that.#service[name] = service;
            },
            delete (name) {
                delete that.#service[name];
                that.#changed = true;
            },
            valueOf () {
                return that.#service;
            }
        };
    }

    async valueOf () {
        if(!this.#signed || this.#changed || new Date().getTime() / 1000 - this.#created > 1000 * 60 * 2) {
            this.#signed = await openpgp.sign({
                message: await openpgp.createCleartextMessage({
                    text: JSON.stringify({service: this.#service, expire: new Date().getTime() / 1000 + this.#timeout})
                }),
                signingKeys: this.#key,
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
 * @returns {{fingerprint: string, expire: number, created: number, object: Object}}
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
        verificationKeys: pubkey,
    });
    if (!verified.signatures[0].valid) {
        throw new Error('签名无效');
    }

    const obj = JSON.parse(verified.data);
    const fingerprint = pubkey.getFingerprint().toUpperCase();
    const created = new Date(
        verified.signatures[0].signature.packets[0].created
    ).getTime() / 1000;
    // 默认5分钟超时
    let expire = created + 1000 * 60 * 5;
    if(obj.expire && typeof obj.expire === 'number' && obj.expire < expire) {
        if(obj.expire < new Date().getTime() / 1000) {
            throw new Error('ticket 已经过期');
        }
        expire = obj.expire;
    }

    return {fingerprint, expire, created, object: obj};
}

/**
 * 存储
 * @param  {...(string|{{pubkey: string, signed: string})} ts
 */
async function store (...ts) {
    for(let t of ts) {
        if(typeof t === 'string') {
            t = JSON.parse(t);
        }
        try {
            const d = await analysis(t);
            // todo 优化成单次操作
            const old = await runtime.db.get(`
                select * from ticket where fingerprint = ?
            `, d.fingerprint);
            if(old && old.created > d.created) {
                continue;
            }
            await runtime.db.run(`
                replace into ticket(
                    fingerprint, service, ticket, created, expire
                ) values (?,?,?,?,?)
            `, d.fingerprint, d.object.ticket, JSON.stringify(t), d.created, d.expire);
        }
        catch(e) {}
    }
}

async function get (fingerprint) {
    const r = await runtime.db.get('select * from ticket where fingerprint = ?', fingerprint.toUpperCase());
    return r ? r.ticket : null;
}

async function neighbor (fingerprint, field = 'ticket') {
    const l = await runtime.db.all(`
        select * from (
            select * from ticket
            where fingerprint<=$fingerprint and service=true
            order by fingerprint desc
            limit $radius
        )
        union
        select * from (
            select * from ticket
            where fingerprint>=$fingerprint and service=true
            order by fingerprint asc
            limit $radius
        )
    `, {$fingerprint: fingerprint, $radius: 5});
    return l.map(t=>(t[field]));
}

async function dynamic_lookup_neighbor (fingerprint, callback, stop = ()=>(false)) {
    const history_set = new Set(); // 记录已经请求过的服务
    let services = obj.bootstrap;
    let loop_flag = true;
    while(loop_flag && services.length > 0) {
        await Promise.all(services.map(async s=>{
            const stop_signal = stop();
            if(stop_signal instanceof Promise ? await stop_signal : stop_signal) {
                loop_flag = false;
                return;
            }
            const call = callback(s);
            if(call instanceof Promise) {
                await call;
            }
            try {
                const r = await axios.get(urljoin(s, 'api/ticket', fingerprint, 'neighbor'));
                await store(... r.data.list);
            }
            catch(e) {}
            history_set.add(s);
        }));

        const nearest_services = await neighbor(fingerprint, 'service');
        services = Array.from(new Set(nearest_services.filter(k=>!history_set.has(k))));
    }
}

async function auto_publish () {
    const t = await obj.ticket.valueOf();
    const fpr = runtime.key.getFingerprint().toUpperCase();
    await dynamic_lookup_neighbor(fpr, async (s)=>{
        try {
            await axios.put(urljoin(s, 'api/ticket'), t);
        }
        catch(e) {}
    });
}

async function provide () {

}

async function init ({
    bootstrap = [],
    enable = [],
} = {}) {
    obj.bootstrap = bootstrap;

    // 建表
    await runtime.db.run(`
        create table if not exists ticket (
            fingerprint text primary key, -- 指纹
            service text, -- ticket 服务地址
            ticket text not null, -- ticket原始内容，与fingerprint构成key-value
            created number not null, -- ticket 的创建时间，只保存最新的ticket，旧的ticket无法覆盖新的数据
            expire number not null -- 超时自动删除，默认保存5分钟
        )
    `);

    // 创建本机的ticket对象
    obj.ticket = new ticket(runtime.key);

    // 自动删除超时数据
    const auto_delete = async ()=>{
        runtime.db.run(`
            delete from ticket where expire < ?
        `, new Date().getTime() / 1000);
    };
    await auto_delete();
    setInterval(auto_delete, 1000 * 60);

    // 自动发布托管ticket
    await auto_publish();
    setInterval(auto_publish, 1000 * 60);

    // todo 周期性检查其他的service是否可用，不可用则删除
}

module.exports = {
    init,
    store,
    get,
    neighbor,
    dynamic_lookup_neighbor,
    analysis,
    /**
     * @returns {ticket}
     */
    get ticket () {
        return obj.ticket;
    },
    get bootstrap () {
        return obj.bootstrap;
    }
};
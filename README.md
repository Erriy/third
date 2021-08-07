# third


服务器仅存储公开以及需要中转的加密数据，所有其他逻辑均在客户端


``` jsonc
// ticket 携带内容格式
{
  "expire": "...", // 指定ticket过期时间，不指定则为创建后5分钟过期
  "device": [], // 账户下的设备，可以不指定，则通过service字段的服务地址进行查询
  "service": "http://xxxxx", // third 服务地址
  "provider": false, // 是否提供ticket查询服务，不指定则为false
}
```
## 原理

### 必要的pgp知识

- yubikey

### ticket的dht网络实现原理

### 单账号多设备实现原理

## todo

- [ ] 直接登录、请求登录、允许登录、登出
- [ ] 删除设备

- [ ] 终端别名
- [ ] session加密
- [ ] 向终端或账号发送数据
- [ ] 同步表
  - 做一个同步表，表格内的所有数据在账号的所有设备下同步
- [ ] 代码整理
  - 初版为了实现功能，代码结构比较凌乱，bin中混杂着大量的driver部分代码，driver部分代码copy很多次
- [ ] 插件化，支持插件市场
- [ ] 支持云服务代理（可以进行收费购买，也可以自建）
    - 一个个人网关，不暴露个人设备，网关服务代理中转所有请求
    - 托管开放数据，类似博客、微博等功能，发布自己的公开数据
    - 代收私信等功能，防止暴露个人设备，防止所有设备都不在线的情况下无法收取服务，类似邮件服务器或网站站内信
- [ ] 远程控制
- [ ] 访问权限控制
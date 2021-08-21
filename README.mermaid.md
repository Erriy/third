# third

基于**kns\[地址解析\]-relay\[内网穿透\]-rpc\[远程调用\]**的去中心化的类 icloud 账号通讯体系

> 我的公钥：[46C8 3280 1B39 E4EB 61DE 615E 699A 698E 7777 7777](https://keyserver.ubuntu.com/pks/lookup?op=get&search=0x46c832801b39e4eb61de615e699a698e77777777)

## 0. 相关知识

- pgp
  - gpg([阮一峰 GPG 入门教程](http://www.ruanyifeng.com/blog/2013/07/gpg.html))
  - [openpgpjs](https://github.com/openpgpjs/openpgpjs)
- [gpg smartcard](https://wiki.gnupg.org/SmartCard)
  - yubikey
    - [开启触摸保护](https://iamtwz.gitbooks.io/yubikey-handbook-chinese/content/openpgp/touch-protection/)

## 1. 使用方法

### 1.1 应用使用说明

> **请自行确保本机已安装 gpg 套件**
>
> - windows: [gpg4win](https://www.gpg4win.org/)
> - macOS: [gpg suite](https://gpgtools.org/)
> - linux：一般默认安装

- 打开[应用下载页面](https://github.com/Erriy/third/releases/latest)下载应用，安装
- 运行应用后，托盘中会出现本应用图标

![](https://raw.githubusercontent.com/Erriy/pics/main/2021_08_21/I3enaP_13_55_55.png)

- 点击登录，弹出账户登录页面

  > 注意：
  >
  > - 第一个设备登录时，本机必须有这个 gpg 的私钥，确定能签名数据。
  > - 第二个设备登录时，如果本机依然有私钥，则可以直接本机签名登录，否则会向已登录的设备发送登录请求，已登录且能使用 key 签名的设备会在菜单中显示登录请求，允许后即完成登录。

  - 登录页面：（如果本机有签名能力则直接登录成功）

  ![](https://raw.githubusercontent.com/Erriy/pics/main/2021_08_21/2jyQiL_14_00_12.png)

  - 允许登录：（如果第二个登录设备没有签名能力，则有签名能力的设备允许登录后会登录成功）

  ![](https://raw.githubusercontent.com/Erriy/pics/main/2021_08_21/EpaXf7_14_21_27.png)

- 确定后会调用 gpg 进行签名登录信息操作，完成后即登录完成

![](https://raw.githubusercontent.com/Erriy/pics/main/2021_08_21/tun6ad_14_01_25.png)

### 1.2 docker 启动

> 注意，只有服务器建议 docker 启动，提供 kns 和 relay 服务
>
> 剪贴板、账户系统都在 electron 部分代码中，docker 中不会启动此部分代码

- docker 直接启动服务

  ```shell
  # 因为需要获取本机真实ip，所以net指定为host模式
  docker run -d --net=host erriy/third --port 5353 --provider --enable-relay
  ```

- docker-compose 启动

  ```shell
  # 拉取预构筑镜像启动
  docker-compose up --build third-image
  # 本地构建启动
  docker-compose up --build third-build
  ```

### 1.3 代码使用说明

- 下载并安装依赖包

  ```shell
  git clone https://github.com/Erriy/third
  ```

- 安装依赖包

  ```shell
  # 在源代码根目录执行
  npm install
  ```

- 启动 ui 界面服务，页面使用 vue 编写

  ```shell
  npm run vue:serve
  ```

- 启动 electron 应用（ui 显示部分依赖 vue，建议启动完 vue:serve 后再启动）

  ```shell
  # 在windows下可能存在中文输出乱码，使用 chcp 65001 命令切换shell编码后即可正常显示中文
  npm run electron:serve
  ```

- 打包应用（打包完成后在 dist 文件夹中）

  ```shell
  npm run build
  ```

## 2. 原理

### 2.1 kns

kns（key name system）主做类 dns（domain name system）的基于 pgp 公钥指纹的地址解析模块

#### 2.1.1 record

##### 2.1.1.1 record 携带对象 object 详细格式

```jsonc
{
  // 指定record过期时间，不指定则为创建后5分钟过期，过期机制防止历史数据被恶意利用
  "expire": "...",
  // 附属子设备，可以不指定
  "device": [],
  // 服务地址，可以不指定
  "service": "http://xxxxx",
  // 是否提供kns查询和存储功能
  "provider": false
}
```

##### 2.1.1.2 record 发布格式

```jsonc
{
  // pubkey为pgp公钥数据，供验证signed部分签名是否正确
  "pubkey": "...",
  // signed为实际签名部分，对record的对象JSON序列化后的clearsign
  "signed": "..."
}
```

##### 2.1.1.3 record 解析示例

```mermaid
graph LR

input([获取record])
verify_signed{{签名验证}}
parse[反序列化record对象]
verify_expire{{是否已超时}}
output([返回解析结果])
throw([抛出异常])

input-->verify_signed
verify_signed-->|通过| parse
verify_signed-->|未通过| throw
parse-->verify_expire
verify_expire-->|超时| throw
verify_expire-->|未超时| output
```

以下方 record 为例，解析过程如下：

- 使用 pubkey 验证 signed 数据签名是否正确
- 提取签名中的携带的 JSON 序列化数据，解析 expire，判断是否超时
- 解析后对象中的 service 即为对端暴露的数据接口，本例中为http://192.168.199.149:34105/

```jsonc
{
  // 公钥
  "pubkey": "-----BEGIN PGP PUBLIC KEY BLOCK-----\n\nxjMEYRY2BhYJKwYBBAHaRw8BAQdAkOqLs1eMpGDDEsXg220YLdm4ZSsLViZc\nB1vD4Wfw0kPNBXRoaXJkwowEEBYKAB0FAmEWNgYECwkHCAMVCAoEFgACAQIZ\nAQIbAwIeAQAhCRB/ULsrLsg+PxYhBBuBUCZT+khM+paIKn9QuysuyD4/VAwA\n/A2R51vmuELCaT7gZ4AAvY5czskvt7PCtysIBhtKSLN3AP9VN4Uy4pr6oofP\nl3/JwBpiHmrtZ6LxzfWs6acpUxtqCc44BGEWNgYSCisGAQQBl1UBBQEBB0C5\nZGUFsxcfZoUutRgEYIu/HuH83C8ubV3v0xFfCCJfHwMBCAfCeAQYFggACQUC\nYRY2BgIbDAAhCRB/ULsrLsg+PxYhBBuBUCZT+khM+paIKn9QuysuyD4/JV0B\nANw7XgMMf5sG9yD9EGHG6UNp6d/N0NGy7TrSUNLfG/5GAQDWNwkL+xcn14b5\nW8Z7BvWeqYimNz8Cd54Ggzjpb/bEBw==\n=uyqt\n-----END PGP PUBLIC KEY BLOCK-----\n",
  // 签名后的object对象
  "signed": "\n-----BEGIN PGP SIGNED MESSAGE-----\nHash: SHA512\n\n{\"service\":\"http://192.168.199.149:34105/\",\"expire\":1629693271.874}\n-----BEGIN PGP SIGNATURE-----\n\nwnUEARYKAAYFAmEZ/ZcAIQkQf1C7Ky7IPj8WIQQbgVAmU/pITPqWiCp/ULsr\nLsg+P8LrAPkBG747gXTJNS1LI9kQwlLLBAKT4prr5B0gExbh5/gz0QEAwgRR\nQgwzda5fudsFYogPhDMClHODhlnzabsN8he7XAk=\n=khc4\n-----END PGP SIGNATURE-----\n"
}
```

#### 2.1.2 mdns

mdns 功能主要做内网设备发现，在 mdns 功能启动的情况下，会周期性内网 query 'third.local'域名，所有开启 mdns 功能的其他终端均会响应，具体原理查看[mdns](https://en.wikipedia.org/wiki/Multicast_DNS)词条。

#### 2.1.3 dht

> _以下内容中包含的距离，使用 sqlite 中的字符串排序计算_

支持简单的 dht 网络搜寻功能，主要目的是去除对 bootstrap 初始节点的依赖，方便全网设备的互相发现。

- 发布流程（周期性发布，watchdog 机制，超时未喂狗则表示对方已下线，服务器会周期性清理 record）

```mermaid
graph LR

record([要发布的记录])
local_find_services[在本地服务器中查找距离最近的kns服务]
check_history{{是否已访问过所有的临近服务器}}
publish_to_service[向服务器发布record]
find_neighbor[向服务器获取距离最近的十个其他服务器]
return([单次发布流程完成])

record-->local_find_services-->check_history
check_history-->|否|publish_to_service-->find_neighbor-->local_find_services
check_history-->|是|return
```

- 查询流程

```mermaid
graph LR

fpr([要查询的指纹])
local_find{{本地数据库中是否存在记录}}
local_find_services[在本地服务器中查找距离最近的kns服务]
check_history{{是否已访问过所有的临近服务器}}
get_from_service[向服务器查询record]
find_neighbor[获取距离最近的服务]
return_null([返回找不到结果])
return([返回解析的结果])

fpr-->local_find
local_find-->|不存在|local_find_services
local_find_services-->check_history
check_history-->|否|get_from_service
get_from_service-->find_neighbor
find_neighbor-->local_find
local_find-->|找到结果|return
check_history-->|是|return_null
```

#### 2.1.4 工作流程

- 持续性发布设备 record 和账户 record 到 bootstrap 和 dht 网络
- 本地局域网持续性使用 mdns 发布和查询，做本地设备发现
- 提供查询方法，查询时返回 record 记录和 mdns 发现的本地服务地址

### 2.2 relay

relay 模块主做 http 请求中继功能（反向代理），类 ngrok、frp 的内网穿透模块，但是仅支持 http 协议，客户端可以嵌入到代码中使用。

以下时序图演示的是 relay 工作流程

```mermaid
sequenceDiagram
    participant ca as 客户端A
    participant r as relay服务端
    participant k as kns服务器
    participant cb as 客户端B
    ca->>r: 请求服务器record
    activate r
    r-->>ca: 返回服务器record
    deactivate r

    ca->r: 建立socket.io长连接通道
    ca->>r: 发送login消息<br>（携带签名并加密的aes256对象，<br>后续使用aes256对称加密传输数据）
    activate r
    r-->>ca: 返回登录成功，以及中继id(relayid)
    deactivate r

    loop 周期性发布
    ca->>k: 发布record，record中的service为中继后的服务地址<br>（可能的service:http://third.on1y.net:5353/relay/${relayid}）
    end

    cb->>k: 查询客户端A的record
    activate k
    k-->>cb: 返回客户端A的record
    deactivate k

    cb->>r: 提取客户端A的record中的service地址<br>向客户端A提交get /path请求<br>(get http://third.on1y.net:5353/relay/${relayid}/path)
    activate r
    r->>ca: 接收到请求，根据relayid得知要转发到客户端A
     activate ca
     ca-->>r: 接收到/path的请求，返回响应数据
     deactivate ca
     r-->>cb: 返回客户端A返回的数据
     deactivate r

```

### 2.3 rpc

基于 http 做的 rpc 调用，方便设备间访问，流程如下

```mermaid
sequenceDiagram
    participant ca as 客户端A
    participant cb as 客户端B

    ca->>cb: request:签名并加密请求数据，携带aes256加密密钥，post /rpc
    note over cb: 解密并验证签名无误后，<br>调用处理函数，<br>获取函数结果
    cb-->>ca: response:将结果和结果sha512一起使用aes256加密返回

    note over ca: 解密并验证sha512是否正确
```

### 2.4 account

账户 record 与设备 record 一致，包括 device 字段的则认定为是一个账户记录。

账户记录会调用 gpg 进行签名，本软件目前并不负责账户的创建和管理工作，

### 2.4.1 登录逻辑

```mermaid
graph TD

keyid([输入keyid])
lookup{{根据keyid查找指纹<br>1.kns中查询<br>2.gpg中查询<br>3.keyserver查询}}
check_fingerprint{{提醒用户指纹确认是否正确}}
check_prikey{{调用gpg查看本地是否拥有私钥<br>确认是否具有签发能力}}
get_record{{查询是否存在账户记录}}
get_record_1{{查询是否存在账户记录}}
local_sign_and_publish[将本机指纹加入device列表<br>本地签名并发布<br>发布到kns服务器和其他设备]
local_sign_and_publish_1[将本机指纹加入device列表<br>本地签名并发布<br>发布到kns服务器]
rpc_login_request{{向其他已登录客户端提交登录请求}}
allow_login{{其他客户端对登录请求进行确认}}
failed([登录失败])
success([登录成功])

keyid-->lookup-->|找到指纹|check_fingerprint-->|确认|check_prikey-->|有签名能力|get_record-->|找到结果|local_sign_and_publish-->success
get_record-->|未找到结果|local_sign_and_publish_1-->success
check_prikey-->|无签名能力|get_record_1-->|找到结果|rpc_login_request-->|成功|allow_login-->|允许,将设备加入device列表并发布record|success
rpc_login_request-->|无设备在线|failed
allow_login-->|不允许|failed
get_record_1-->|未找到结果|failed
lookup-->|未找到指纹|failed
check_fingerprint-->|指纹不正确|failed
```

### 2.4.2 以 clipboard 同步来解释 account 工作原理

```mermaid
graph TD
cb_change([剪贴板内容变动])
list_device{{查找账户下的设备}}
find_other_record{{查找其他设备的record}}
check_local_service{{是否在相同网络}}
local_send_rpc{{本地发送rpc请求<br>设置新的剪贴板内容}}
clear_local_service[删除本地地址记录]
check_service{{检查是否有service字段}}
service_send_rpc{{对service发送rpc请求}}
success([同步成功])
failed([同步失败])

cb_change-->list_device-->|存在其他设备<br>对每个设备进行并发执行后续操作|find_other_record-->|找到记录|check_local_service-->|是|local_send_rpc-->|本地请求成功|success
local_send_rpc-->|本地请求失败|clear_local_service-->check_service
check_local_service-->|否|check_service
check_service-->|有|service_send_rpc-->|请求成功|success
service_send_rpc-->|发送失败|failed
check_service-->|没有|failed
find_other_record-->|没找到记录|failed
list_device-->|没有其他设备|failed
```

## 3. 目前支持功能

- clipboard
  - 文字同步

## 4. Q&A

### 4.1 为什么不使用 pgp 的 subkey 做 device key

如果使用 subkey 做 device key 的话，subkey 丢失需要主 key revoke subkey，然后一直携带到主 key 的公钥中。随着设备的增多或 key 的变化，主 key 的公钥大小会逐渐膨胀，不是想看到的情况。sign-key 也是一样，对设备 key 进行签名则表示对 key 的信任，如果需要踢出设备的话，会需要 revoke 对设备 key 的签名，然后再发布，不如直接签发一段动态信任的数据可靠。

## 5. 碎碎念

- 其实整体逻辑跟 tor 网络有些相似的，又有些像 keybase、icloud 和 tox，本质就是怎么找到对方并可以确认信息未被嗅探和篡改。kns+relay+rpc 调用即可实现找到对方，通过远程调用沟通。
- 账户间通信设计也比较简单，将账户 record 中的 device 部分使用各个设备 key 加密，然后设置 service 字段，service 指定一个缓存服务器，所有设备都连接这个缓存服务器获取数据，就可以不用所有设备在线才能痛心了，也能隐藏账户下的设备，仅暴露一个公开接口，而这个公开接口保留的数据都是加密的，服务器的权限是最低化的。

## 6. todo

- [ ] 设备别名
- [ ] clipboard 同步加强
  - [ ] 文件跨设备拷贝
  - [ ] 截图拷贝
- [ ] 设备远程控制
- [ ] 插件体系/暴露本机接口的扩展
- [ ] 账户间通信
- [ ] 文件同步
  - [ ] 自动备份到 github、网盘、私有云、oss 等
- [ ] 支持云服务代理（可以进行收费购买，也可以自建）
  - 一个个人网关，不暴露个人设备，网关服务代理中转所有请求
  - 托管开放数据，类似博客、微博等功能，发布自己的公开数据
  - 代收私信等功能，防止暴露个人设备，防止所有设备都不在线的情况下无法收取服务，类似邮件服务器或网站站内信
- [ ] 访问权限控制
- [ ] 建立虚拟网卡，做完整的协议支持

解读点：发出请求--http.request。

[TOC]

# 一.故事
王大妈来到10010店铺，要购买5大包棉花。因为棉花这种东西不经常售卖，所以店铺不会提前购置。平时碰到有顾客需要的时候，才临时向供应商调货。

10010店铺跟供应商的合作模式是这样的：店铺需要主动派车去拉货。

碰到这类采购场景，店铺有以下几种应对方式：
* “客户管理机器人”（即店铺管理员）自己开车，去供应商处取货
* 店铺平时养几个司机；“客户管理机器人”把【采购信息和供应商地址】交给司机，让司机去取货

很明显，第一种模式需要关闭店铺，不适合。那么只有第二种方式，交给专业司机去取货。

于是，10010店铺引入了几个司机。

“客户管理机器人”派了一名司机，告诉他去“xx区xx工厂”去取“5大包”棉花。

不久棉花取回来了，交给了“客户管理机器人”，然后转交给王大妈。

我们来看下王大妈此次购物的整体流程：
![远程采购](./img_unit/unit/unit.069.png)

看上去很完美：“客户管理机器人”不用离开，店铺可以继续服务其他客人；司机负责取货，专业准时；

考虑到采购棉花这类需求不多，所以10010店铺按照这种模式，有条不紊地运行着。

突然有一天，店铺来了20个顾客，有的要买棉花，有的要买化肥，有的要买塑料布。总之都是类似棉花这样的商品，都需要开车去供应商那里去取。

按照现在的运行模式，“客户管理机器人”需要做的事情有：

* 记录每个人要买的东西
* 找出对应的供应商的地址
* 把【采购信息+供应商地址】告诉司机，让司机去取货

由于今天这样的采购顾客太多，“客户管理机器人”一下子忙坏了。如果顾客再多一点，恐怕就应付不过来了。

10010店铺决定优化模式，将远程采购流程职责进一步细分，标准化流程化。

于是店铺另外成立两个中心：“采购信息管理中心”和“车队管理中心”，并设立管理员来统筹负责。

* 采购信息管理中心：负责把顾客的采购信息标准化，输出“远程采购单”，交给车队；
* 车队管理中心：只用根据“远程采购单”的信息，就知道去哪里取货，其他事情一概不管。

升级后的模式如下：

* 顾客把要采购的东西告诉“客户管理机器人”
* “客户管理机器人”把采购信息，交给“采购信息管理中心”来进行简单处理，输出标准的“远程采购单”
* “采购信息管理中心”把“远程采购单”移交给“车队管理中心”；“车队管理中心”派出一辆车，根据标准的“远程采购单”，就知道去哪取货了。

整个流程如下：

![升级后的远程采购](./img_unit/unit/unit.070.png)

有一天，又来了一位顾客李大妈，她也要采购2桶麻油（同样需要远程采购）。但是李大妈觉着店铺的车队不靠谱，自己带了司机和车辆去取货。

但是为了不影响整体流程（“采购信息管理中心”这个职能中心的职责不变），所以李大妈自己带来的司机，还是要承接“采购信息管理中心”输出的“远程采购单”。

因此这种特殊场景下的流程调整为：
* 顾客把要采购的东西告诉“客户管理机器人”
* “客户管理机器人”把采购信息，交给“采购信息管理中心”来进行简单处理，输出标准的“远程采购单”
* “采购信息管理中心”直接用用户指定的司机去取货；“车队管理中心”没有介入。

特殊场景下的流程为：
![特殊的远程采购](./img_unit/unit/unit.071.png)

# 二.分析和对照

实际上，升级后的远程采购流程，就是目前nodejs发起远程请求（http.request）的模式。

## 1.原理分析（入门解读）
调用http.request发起远程请求，实际上是创建一个http.ClientRequest实例req，然后把这个req交给http.Agent，把请求发出去。

## 2.关联
* 王大妈  --> 用户
* 客户管理机器人 --> 主线程
* 采购信息管理中心 --> http.ClientRequest(即/lib/_http_client.js中的ClientRequest)
* 远程采购单 --> req（即http.ClientRequest实例）
* 车队管理中心 --> http.Agent(即/lib/_http_agent.js中的Agent)
* 车(司机) --> 即socket（也就是connection，对应/lib/net.js中的Socket实例）

# 三. nodejs源码解读
## 1. 解读入口
我们先看官方的使用样例
```js
// usage example
// 参见 https://nodejs.org/dist/latest-v17.x/docs/api/http.html#httprequesturl-options-callback
const http = require('http');

const postData = JSON.stringify({
  'msg': 'Hello World!'
});

const options = {
  hostname: 'www.google.com',
  port: 80,
  path: '/upload',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
};

const req = http.request(options, (res) => {
  res.on('data', (chunk) => {
    console.log(`BODY: ${chunk}`);
  });
});

// Write data to request body
req.write(postData);
req.end();
```

可以看到，上面的样例主要是调用http.request发送请求；这就是本章需要解读的入口：

```js
// 文件地址：/lib/http.js
function request(url, options, cb) {
  return new ClientRequest(url, options, cb);
}
```

## 2. 源码解读

从上面代码看出，http.request本质就是创建一个ClientRequest实例，我们看下它的代码。

> 由于ClientRequest太长，有136行，所以我们逐块分析
### 2.1 初始化实例req
第一步：准备“远程采购单”。

即通过创建一个实例req：new ClientRequest(url, options, cb)，来保存用户请求的各类信息。

这个req，就是故事场景中的“远程采购单”；
### 2.2 准备agent
第二步：准备一个车队备用。

即准备一个agent。

```js
// 文件地址：/lib/_http_client.js
function ClientRequest(input, options, cb) {
  // 基于OutgoingMessage(_http_outgoing.js，负责往发出的请求中写数据)
  OutgoingMessage.call(this);
  ... // 格式化+标准化options

  let agent = options.agent;
  const defaultAgent = options._defaultAgent || Agent.globalAgent;
  if (agent === false) {
    agent = new defaultAgent.constructor();
  } else if (agent === null || agent === undefined) {
    if (typeof options.createConnection !== 'function') {
      agent = defaultAgent;
    }
    // Explicitly pass through this statement as agent will not be used
    // when createConnection is provided.
  }
  this.agent = agent; // 到此，agent准备完毕
  ...
}
```
上面代码片段，有两个作用：
* 将发起请求的参数进行简单处理（即options）
* 准备agent（即故事章节中的“车队管理中心”）
    * 如果用户有指定agent则使用，否则使用nodejs默认的defaultAgent: Agent.globalAgent;

我们看Agent.globalAgent是啥：
```js
// 文件地址：/lib/_http_agent.js
...
module.exports = {
  Agent,
  globalAgent: new Agent()
};
```
可以看出，这里的globalAgent，就是进程启动时，初始化好的一个Agent实例。

### 2.3 
第三步：派车，根据“远程采购单”去执行任务。

```js
// 文件地址：/lib/_http_client.js
function ClientRequest(input, options, cb) {
  ...// 准备agent（参见2.1）
  
  // 接下来是一些准备工作
  ...// 准备参数：method，host, port, maxHeaderSize
  ...// 初始化实例的属性：shouldKeepAlive, parser, res, timeoutCb等
  ...// 设置头部信息

  // 按照使用场景，发起请求
  // initiate connection
  if (this.agent) {
    this.agent.addRequest(this, options);
  } else {
    // No agent, default to Connection:close.
    this._last = true;
    this.shouldKeepAlive = false;
    if (typeof options.createConnection === 'function') {
      const newSocket = options.createConnection(options, oncreate);
      if (newSocket && !called) {
        called = true;
        this.onSocket(newSocket);
      } else {
        return;
      }
    } else {
      debug('CLIENT use net.createConnection', options);
      this.onSocket(net.createConnection(options));
    }
  }
}
```
上面的代码可以看出，如何派车，有两个选择：
* 如果有agent（车队），则把请求交给agent来处理（由车队派车去处理，其他啥也不用管）
* 如果没有agent（车队）：
  * 如果有指定的个性化的车（options.createConnection），则使用之；
  * 如果没有指定的个性化的车（没有options.createConnection），则使用nodejs自带的net.createConnection（不归属任何车队的独立车辆）

> 无论是options.createConnection，还是net.createConnection，他们的底层实现，都是创建一个Socket实例（/lib/net.js中的Socket），来调用底层的tcp handle（以tcp使用场景为例），发起connect。

我们先看第一个选择：使用agent(通过车队处理请求)

#### 2.3.1 通过agent发送请求

就是上节代码中的
```js
// 文件地址：/lib/_http_client.js
if (this.agent) {
  this.agent.addRequest(this, options);
}
```
我们来看下，this.agent是如何通过addRequest处理请求的。

不过，在这之前，我们先来看下agent的庐山真面目。

##### 先认识agent
```js
// 文件地址：/lib/_http_agent.js
function Agent(options) {
  if (!(this instanceof Agent))
    return new Agent(options);

  EventEmitter.call(this);

  this.defaultPort = 80;
  this.protocol = 'http:';

  this.options = { ...options };

  // Don't confuse net and make it think that we're connecting to a pipe
  this.options.path = null;
  this.requests = {};
  this.sockets = {};
  this.freeSockets = {};
  this.keepAliveMsecs = this.options.keepAliveMsecs || 1000;
  this.keepAlive = this.options.keepAlive || false;
  this.maxSockets = this.options.maxSockets || Agent.defaultMaxSockets;
  this.maxFreeSockets = this.options.maxFreeSockets || 256;

  this.on('free', (socket, options) => {
    ...// 稍后展开介绍
  });

  // Don't emit keylog events unless there is a listener for them.
  this.on('newListener', maybeEnableKeylog);
}
```

可以看出，agent自身属性比较简单，其中有三个核心的队列（说数组更合适）：
* requests：当前还未发出去的req。（其实叫pendingRequests更合适）
  * 即【处于积压状态，还未分配车辆】的“远程采购单”
* sockets：当前正在处理请求的socket。（其实叫inUsingSockets更合适）
  * 即已经分配了“远程采购单”，正在执行任务的车辆
* freeSockets：空闲的socket。
  * 即车队中空闲的车辆

> 细心的读者会发现，this.requests， this.sockets， this.freeSockets都不是数组，而是一个对象。
> 为什么是对象呢？因为agent要管理很多不同目标站点的请求，所以采用{domain:[]}的方式来管理
> 比如requests:
> this.requests = {"qq.com": [req1, req2], "baidu.com": [req3, reqN]}
>
> 注意：key代表了目标站点，包含的信息很多，比如“qq.com:80::4”（参见/lib/_http_agent.js中的Agent.prototype.getName方法），这里只是简单写成“qq.com”


Agent除了初始化上面提到的属性，还做了两个事件监听：
* this.on('free', cb)
* this.on('newListener', cb)

我们重点看下this.on('free', cb)，它的作用是：
监听一个free事件；当agent管理的socket有空闲时，触发这里的回调cb。

>备注： 
>通过agent创建socket时（有不通过agent创建的socket，后续再展开），socket创建完成后，一般会执行 installListeners。
installListeners里面，有一段代码：
>```js
>function onFree() {
>    debug('CLIENT socket onFree');
>    agent.emit('free', s, options);
>  }
>  s.on('free', onFree);
>```
>会对创建好的socket(即下面代码中的s)监听free事件。
后续的流程是：
> * 等socket空闲时（参见_http_client.js中的responseKeepAlive），会触发onFree;
> * onFree会接着触发agent.emit('free', s, options);
> * 由于agent监听过free，this.on('free', cb)，所以cb被执行

我们先剧透下cb的逻辑：当有socket空闲出来时
* 检测是否有pending状态的请求，如果有，则直接使用这个空闲出来的socket发送出去
* 如果没有pending状态的请求，则放到freeSockets中待用（前提是可复用）
  * 是否可复用，是socket上一个req的属性，而非socket自身（读者可以忽略这一点）

详细代码逻辑，我们先不展开；先看下，有了agent，怎么使用agent发出请求。


##### agent发送请求
通过agent发送请求，其实就是通过把req添加到agent中，交给它管理。
即this.agent.addRequest(this, options);

```js
// 文件地址：/lib/_http_agent.js
Agent.prototype.addRequest = function addRequest(req, options, port, localAddress) {
  ...// 处理options
  const name = this.getName(options);
  if (!this.sockets[name]) {
    this.sockets[name] = [];
  }

  // 1.先看有没有空闲的socket
  const freeSockets = this.freeSockets[name];
  let socket;
  if (freeSockets) {
    while (freeSockets.length && freeSockets[0].destroyed) {
      freeSockets.shift();
    }
    socket = freeSockets.shift();
    if (!freeSockets.length)
      delete this.freeSockets[name];
  }

  const freeLen = freeSockets ? freeSockets.length : 0;
  const sockLen = freeLen + this.sockets[name].length;
  // 2.如果有空闲的socket，则把socket分配给req（setRequestSocket）去执行任务
  if (socket) {
    // Guard against an uninitialized or user supplied Socket.
    const handle = socket._handle;
    if (handle && typeof handle.asyncReset === 'function') {
      // Assign the handle a new asyncId and run any destroy()/init() hooks.
      handle.asyncReset(new ReusedHandle(handle.getProviderType(), handle));
      socket[async_id_symbol] = handle.getAsyncId();
    }

    this.reuseSocket(socket, req);
    setRequestSocket(this, req, socket);
    this.sockets[name].push(socket);
  } else if (sockLen < this.maxSockets) {
    // 3. 如果没有空闲的，且可以创建，则临时创建一个
    debug('call onSocket', sockLen, freeLen);
    // If we are under maxSockets create a new one.
    this.createSocket(req, options, handleSocketCreation(this, req, true));
  } else {
    debug('wait for socket');
    // 4. 如果没有空闲的，且不能再创建，则先挤压起来
    // We are over limit so we'll add it to the queue.
    if (!this.requests[name]) {
      this.requests[name] = [];
    }
    this.requests[name].push(req);
  }
};
```
从上面代码可以看出，addRequest的作用为：
* 如果有空闲的socket，则取出一个分配给req（setRequestSocket），去执行任务
* 如果没有空闲的socket，并且可以创建（sockLen < this.maxSockets），则临时创建一个socket，分配给req，去执行任务
* 如果没有空闲的socket，并且不可以创建，则把找个req挤压起来this.requests[name].push(req);
> 此处的name就是目标站点，比如”qq.com“。



##### agent发送请求后，socket回收
```js
// 文件地址：/lib/_http_agent.js
this.on('free', (socket, options) => {
    const name = this.getName(options);
    debug('agent.on(free)', name);

    // TODO(ronag): socket.destroy(err) might have been called
    // before coming here and have an 'error' scheduled. In the
    // case of socket.destroy() below this 'error' has no handler
    // and could cause unhandled exception.

    if (!socket.writable) {
      socket.destroy();
      return;
    }

    const requests = this.requests[name];
    if (requests && requests.length) {
      const req = requests.shift();
      setRequestSocket(this, req, socket);
      if (requests.length === 0) {
        delete this.requests[name];
      }
      return;
    }

    // If there are no pending requests, then put it in
    // the freeSockets pool, but only if we're allowed to do so.
    const req = socket._httpMessage;
    if (!req || !req.shouldKeepAlive || !this.keepAlive) {
      socket.destroy();
      return;
    }

    let freeSockets = this.freeSockets[name];
    const freeLen = freeSockets ? freeSockets.length : 0;
    let count = freeLen;
    if (this.sockets[name])
      count += this.sockets[name].length;

    if (count > this.maxSockets ||
        freeLen >= this.maxFreeSockets ||
        !this.keepSocketAlive(socket)) {
      socket.destroy();
      return;
    }

    freeSockets = freeSockets || [];
    this.freeSockets[name] = freeSockets;
    socket[async_id_symbol] = -1;
    socket._httpMessage = null;
    this.removeSocket(socket, options);

    socket.once('error', freeSocketErrorListener);
    freeSockets.push(socket);
  });
```

#### 2.3.2 通过指定车辆直接发送请求

# 四.总结

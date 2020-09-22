解读点：nodejs服务如何处理并发请求。

[TOC]

# 一.故事
这一天，10010店铺同时来了两位客人，王大妈和李大妈。

俩人前后脚进了店铺，都往“红色篮子”里面写了字条（王大妈的字条在前，李大妈的字条在后）。
![alt 王大妈和李大妈写字条到红色篮子]()
机器人马上过来，从篮子里取出两个字条。

机器人先给王大妈分配了一个“蓝色篮子”，在上面写了一个数字“5”；然后在篮子上方放了一个探测器。
接着机器人又给李大妈分配了一个“蓝色篮子”，在上面写了一个数字“6”；然后也在篮子上方放了一个探测器。
做完这些，机器人就走了。
![alt 王大妈和李大妈的篮子分配完毕，王大妈的在队列前]()

王大妈今天要采购的东西包括：
* 1斤芝麻
* 2斤土豆
* 3斤西红柿

于是王大妈写了3个字条“芝麻，1斤”，“土豆，2斤”， “西红柿，3斤”，放到5号篮子里；

李大妈今天要采购的东西包括：
* 1瓶矿泉水
* 2斤马铃薯
* 3包盐
* 4根火腿肠
* 5两茶叶

李大妈写了5个字条“矿泉水，1瓶”，“马铃薯，2斤”，“盐，3包”，“火腿肠，4根”，“茶叶，5两”，放到6号篮子里。

王大妈和李大妈在同一时间完成了写字条，放字条的动作。

此时机器人过来了。

它先从5号篮子里面取出王大妈字条，转身走到后面去取了“1斤芝麻，2斤土豆，3斤西红柿”，放到了5号篮子里。王大妈拿到了东西，离开店铺。

![alt 机器人取芝麻放到5号篮子]()

接着它又从6号篮子里面取出李大妈的字条，转身走到后面取了“1瓶矿泉水，2斤马铃薯，3包盐，4根火腿肠，5两茶叶”，放到6号篮子里。李大妈拿到了东西，离开店铺。

// todo 5号篮子的消失时机
![alt 机器人取矿泉水放到6号篮子，5号篮子已经消失]()
# 二.分析和对照
从上面的故事场景中看到，10010店铺可以同时服务多个客户。这跟nodejs服务可以处理并发请求是一样的。

但是由于店铺中只有一个机器人，所以多个客户的交易，还是按照顺序来完成的。nodejs也是一样，虽然可以处理高并发的海量请求，但是实际上还是按照次序一个一个串行处理完成的。

按照故事中的场景，我们来设计一下真实nodejs服务器下，两个用户并发请求的情况：
* 有个用户A,并行发送3个请求到服务器；
* 几乎在同一时间点，另外一个用户B,并行发送5个请求到服务器。
* 该服务器处理每个请求的时间需要20ms（假设）。

此时服务器会收到8个请求（8 requests）;但是由于目前都是长连接，所以服务端其实只收到了两个连接（2 tcp connections）。总结一下：
* 建立 2个 tcp connections，用来通信。
* 共计需要处理 8个 requests（第一connection 3个，第二个connection 5个）

## 1.原理分析
nodejs服务启动后，只有一个主线程在运行一个无限循环。

在这个循环中，libuv首先通过服务实例的观察者，接受新的客户端tcp握手请求。tcp握手请求建立完成后，对每一个tcp链接创建一个新的客户端实例，并注册到libuv中。

然后libuv将观察新创建的两个客户端实例，一旦有数据到来，便执行对应的回调。
## 2.关联
* 王大妈 --> 用户A访问服务，建立的tcp链接
* 李大妈 --> 用户B访问服务，建立的tcp链接
* 5号篮子  --> libuv封装的客户端实例1,用来和用户A通信
* 6号篮子  --> libuv封装的客户端实例2,用来和用户B通信
* 1斤芝麻  --> 用户A发送的第1个请求
* 4根火腿肠 --> 用户B发送的第4个请求
* 机器人   --> nodejs主线程
# 三. nodejs源码解读
## 1. 解读入口

nodejs的net.js中，并没有判断一个post请求是否结束。
现在的框架中，一般使用bodyparser之类的库来解析。

我们来看戏koa-bodyparser是怎么做到。

koa-bodyparser
```js
// 文件：npm库koa-bodyparser index.js
var parse = require('co-body');
...
module.exports = function (opts) {
  ...

  return async function bodyParser(ctx, next) {
    ...
        const res = await parseBody(ctx);
    ...
  };

  async function parseBody(ctx) {
    if (enableJson && ((detectJSON && detectJSON(ctx)) || ctx.request.is(jsonTypes))) {
      return await parse.json(ctx, jsonOpts);
    }
    ...
    return {};
  }
};
```
可以看出它依赖了require('co-body')来解析。

```js
// 文件：npm库 co-body
const raw = require('raw-body');
...
module.exports = async function(req, opts) {
  ...
  // 读取headers中的content-length
  let len = req.headers['content-length'];
  const encoding = req.headers['content-encoding'] || 'identity';
  if (len && encoding === 'identity') opts.length = len = ~~len;

  const str = await raw(inflate(req), opts);
  ...
};
```
这里，co-body通过require('raw-body')，来读取原生的字符串。

玄机就在raw-body这里。
```js
// 文件：npm库 raw-body
function getRawBody (stream, options, callback) {
  
  var length = opts.length != null && !isNaN(opts.length)
    ? parseInt(opts.length, 10)
    : null
  
  if (done) {
    // classic callback style
    return readStream(stream, encoding, length, limit, done)
  }

  return new Promise(function executor (resolve, reject) {
    readStream(stream, encoding, length, limit, function onRead (err, buf) {
      if (err) return reject(err)
      resolve(buf)
    })
  })
}
...
function readStream (stream, encoding, length, limit, callback) {
  ...
  // attach listeners
  stream.on('aborted', onAborted)
  stream.on('close', cleanup)
  stream.on('data', onData)
  stream.on('end', onEnd)
  stream.on('error', onEnd)

  // mark sync section complete
  sync = false

  function done () {
    ...
  }

  function onAborted () {
    ...
  }

  function onData (chunk) {
    ...
  }

  function onEnd (err) {
    ...
  }

  function cleanup () {
    ...
  }
}
```
可以看出，这里通过readStream来读取。读取的大小就在于length。
这个length就是在co-body中，通过let len = req.headers['content-length'];来读取的。
通过Content-Length来判断一个请求的大小。
![alt 如何判定post请求是否结束](./img/postReqCheckEnd.png)
## 2. 源码解读


# 四.总结：

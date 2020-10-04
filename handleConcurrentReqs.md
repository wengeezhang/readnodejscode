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

它先从5号篮子里面取出王大妈的第一个字条（假设顺序上第一个是“1斤芝麻”），转身走到后面去取了“1斤芝麻“，放到了5号篮子里；


![alt 机器人取芝麻放到5号篮子]()
然后机器人又取一个字条，此时字条是“2斤土豆”，机器人转身走到后面，取 “2斤土豆”，放到了5号篮子里；

接着机器人又取了一个字条，字条时“3斤西红柿”，机器人转身走到后面，取“3斤西红柿”，放到5号篮子里。

机器人又去取字条，此时5号篮子里字条没有了，于是机器人开始去处理6号篮子，开始接待李大妈这个客户。

王大妈拿到了东西，离开店铺。

// todo 5号篮子的消失时机
![alt 机器人处理6号篮子，5号篮子已经消失]()
机器人按照上面的循环动作，处理完李大妈的需求；李大妈拿到东西，离开店铺。

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

然后libuv将观察新创建的客户端实例，一旦有数据到来，便执行对应的回调。
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
libuv的无限循环不断封装的libuv客户端实例是否有数据到来，一旦有数据到来，便执行回调w->cb();
```c++
// 位于/src/deps/uv/src/unix/core.c
int uv_run(uv_loop_t* loop, uv_run_mode mode) {
  ...
  while (r != 0 && loop->stop_flag == 0) {
    ...
    uv__io_poll(loop, timeout);
    ...
  }
  ...
}
// 文件地址：/deps/uv/src/unix/linux-core.c
void uv__io_poll(uv_loop_t* loop, int timeout) {
  ...
  for (;;) {
      ...
          w->cb(loop, w, pe->events);
      ...
    }
    ...
  }
}

```
在上一节中，我们分析过，客户端实例的回调，最终会经过一系列链路，触发启动服务时，业务写的回调函数，即下面net.createServer的参数函数

```js
// 1.引入net
const net = require('net');
// 2.创建一个服务
const server = net.createServer((c) => {
  ...
  c.on('data', () => {
      console.log('data event');
      c.write('HTTP/1.1 200 OK\r\n');
        c.write('Connection: keep-alive\r\n');
        c.write('Content-Length: 12\r\n');
        c.write('\r\n');
        c.write('hello world!');
  })
});

// 3.监听端口
server.listen(9090, () => {
  console.log('server bound');
});
```

此时，你的脑海里肯定冒出这样一个疑问，两个用户，8个请求，nodejs怎么区分两个用户，并对8个请求分别处理，并返回结果呢？

## 2.源码解读

### 2.1 如何区分两个用户？
在服务启动时，会创建一个对应的libuv服务实例，由libuv监听起来。
还是uv__io_poll这个函数，我们省略无关代码，从另一个角度解读。
```c++
// 文件地址：/deps/uv/src/unix/linux-core.c
void uv__io_poll(uv_loop_t* loop, int timeout) {
  // 取出服务实例
  while (!QUEUE_EMPTY(&loop->watcher_queue)) {
    q = QUEUE_HEAD(&loop->watcher_queue);
    ...
  }
  ...
  // 4.开启一个无限循环，监听是否有新用户到来
  for (;;) {
    ...
      nfds = epoll_wait(loop->backend_fd, events, ARRAY_SIZE(events), timeout);
    ...
        // 新用户来了，便执行回调w->cb。
        // 上一章已经分析，这里的w->cb就是uv__server_io,为每个新用户创建一个libuv客户端实例
          w->cb(loop, w, pe->events);
    ...
  }
}
```

从上面代码的注释解读，可以看到，程序为每个用户都分配了libuv客户端实例（对应的，内核操作系统也会创建两个socket）。

而每一个libuv客户端实例，就是下面代码片段中的"c"。
```js
const server = net.createServer((c) => {
  ...
  c.on('data', () => {
      console.log('data event');
      c.write('HTTP/1.1 200 OK\r\n');
        c.write('Connection: keep-alive\r\n');
        c.write('Content-Length: 12\r\n');
        c.write('\r\n');
        c.write('hello world!');
  })
});
```
>（libuv客户端实例是如何作为参数c传进来的，请参考上一章的解读）

### 2.2 如何区分8个请求？

这8个请求，有3个是用户A的，有5个是用户B的。 上一节中，我们解读了如何区分用户。

那么问题的本质也就演化为：如何区分用户A的3个请求呢？

答案是： 我们必须在c.on('data', callback)的回调函数callback中处理这一切。

伪代码如下：

```js
    const reqData = [];
    c.on('data', (chunk) => {
        if(请求结束标识){
            reqData.push(chunk);
            reqData已经完整，开始处理...
            清空reqData
            返回
        }else{
            reqData.push(chunk)
        }
    })
```

> 实际上，nodejs已经封装了一个native模块http.js, 通过http-parser(node12以后改为llhttp),来解析用户的请求。
> 很多的nodejs框架以及连带的库（比如koajs + koa-bodyparser），也是基于此做了进一步封装，业务开发其实并不用真正关心。

由于用户A的所有请求公用一个c，都是在c.on('data', callback)这里触发，只要能区分3个请求的边界，便可以分别处理了。

那么业务开发，怎么判断“请求结束标识”呢？ 接下来，我们试着

我们知道，现在的http请求一般有get,post, put,delete等方法，常用的有get,post。我们就以get,post来举例，看下怎么判断“请求结束标识”。

#### 2.2.1 get请求
首先，需要解读一下读取前的配置逻辑。
在上一章的2.6小节中，我们知道stream.alloc_cb其实是
```c++
// 文件地址：/src/stream_wrap.cc
[](uv_handle_t* handle, size_t suggested_size, uv_buf_t* buf) {
    static_cast<LibuvStreamWrap*>(handle->data)->OnUvAlloc(suggested_size, buf);
  }

// 文件地址：/deps/uv/src/uv-common.c 
// todo uv_buf_init端点确认细节
uv_buf_t uv_buf_init(char* base, unsigned int len) {
  uv_buf_t buf;
  buf.base = base;
  buf.len = len;
  return buf;
}
```

而在uv__read中，是这样调用它的：
```js
static void uv__read(uv_stream_t* stream) {
    ...
  while (stream->read_cb && (stream->flags & UV_HANDLE_READING) && (count-- > 0)) {
      ...
    stream->alloc_cb((uv_handle_t*)stream, 64 * 1024, &buf);
    ...
    stream->read_cb()
  }
  ...
}
```

可见，这里分配了一个 64 * 1024 = 65536bytes大小的读取量，然后调用读取方法stream->read_cb()进行读取。

我们先来看看一个普通的http请求的结构
```js
1. start line（GET / HTTP/1.1）
2. header1
   header2
   ...
   headern
3. 
4. body数据（可选）
```

可以看到，一个http包含四部分
1. 起始行，用于表示请求的类型，协议类型和版本
2. 头部信息，比如content-type之类的
3. 空白行，表示请求的元信息已经结束
4. body数据，附带的数据。get，head等类型的请求没有这一部分。


一个http get请求，请求参数一般会放在url后面，body数据为null。

分析到这里，就可以很简单地得出答案了：
对于GET类型的请求，读取到“空白行”就表示结束了，因此，“空白行”就是我们要寻找的“请求结束标识”。

#### 2.2.2 post请求

由于post类型的请求，会携带body数据。因此，post类型的“请求结束标识”肯定不是“空白行”；并且post请求，有的body数据只有1kb，有的则高达10Mb甚至更多。

那么我们怎么寻找post类型的“请求结束标识”呢？


现在的框架中，一般使用bodyparser之类的库来解析。我们来看戏koa-bodyparser是怎么做到。

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
// 这里的req就是ctx
module.exports = async function(req, opts) {
  ...
  // 读取headers中的content-length
  let len = req.headers['content-length'];
  const encoding = req.headers['content-encoding'] || 'identity';
  if (len && encoding === 'identity') opts.length = len = ~~len;

  const str = await raw(inflate(req), opts); // inflate 解压缩http数据流
  ...
};
```
这里，co-body通过require('raw-body')，来读取原生的字符串。

玄机就在raw-body这里。
```js
// 文件：npm库 raw-body
// 这里的stream其实还是ctx
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

由此来看，对于post类型的请求，我们要寻找的“请求结束标识”，就是请求头中的‘content-lenght’, 即headers['content-length']


一般我们用koa-bodyparser时，都会设置一个大小限制
```js
// 业务代码
app.use(bodyParser({
    formLimit: limitVal,
    jsonLimit: limitVal,
}));

// 文件地址：npm koa-bodyparser

function formatOptions(opts, type) {
  var res = {};
  copy(opts).to(res);
  res.limit = opts[type + 'Limit'];
  return res;
}

// 文件地址：npm co-body
opts.limit = opts.limit || '1mb';

// 文件地址：npm raw-body
 var limit = bytes.parse(opts.limit)
...
function onData (chunk) {
  if (complete) return

  received += chunk.length

  if (limit !== null && received > limit) { // 超过大小限制
    done(createError(413, 'request entity too large', {
      limit: limit,
      received: received,
      type: 'entity.too.large'
    }))
  } else if (decoder) {
    buffer += decoder.write(chunk)
  } else {
    buffer.push(chunk)
  }
}
```
# 四.总结：

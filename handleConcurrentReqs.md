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

由于用户A的所有请求公用一个c，都是在c.on('data', callback)这里触发，只要能区分3个请求的边界，便可以分别处理了。

那么业务开发，怎么判断“请求结束标识”呢？ 接下来，我们从小白的角度来分析一下如何判断。

我们知道，现在的http请求一般有get,post, put,delete等方法，不同的方法类型，有不同的“请求结束标识”。

#### 2.2.1 get请求

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

#### 2.2.2 post等带有body的请求

由于post类型的请求，会携带body数据。因此，post类型的“请求结束标识”肯定不是“空白行”；并且post请求，有的body数据只有1kb，有的则高达10Mb甚至更多。

那么我们怎么寻找post类型的“请求结束标识”呢？

按照http标准，对于携带body的请求，要么提供content-length，要么通过“transfer-coding： chunked”的方式。
对于前者，接收方可以通过长度判断数据是否接受完毕；对于后者，则通过接受一个0大小的chunk来判断接受完毕。

因此，对于post这类携带body大小的请求，“content-length”或者“size为0的chunk”，就是我们要寻找的“请求结束标识”。

#### 2.2.3 http解析器

从2.2.1和2.2.2小节中，我们大概知道了怎么区分多个请求的边界。但是如果要真的实现起来，将会非常复杂。
如果这种事情nodejs不做处理，交给业务使用者，那么恐怕nodejs将会无人问津。


基于此，nodejs已经封装了一个native模块http.js。这个模块通过http-parser(node12以后改为llhttp),来解析用户的请求。
http-parser(或者llhttp)实际上是一个有限状态机，不断读取字符，以实现解析请求数据。
很多的nodejs框架以及连带的库（比如koajs + koa-bodyparser），也是基于此做了进一步封装，业务开发其实并不用真正关心。

接下来，我们来看下，http.js模块，底层是如何运作的。

> 注：由于我们是解读的nodejs14版本，因此，这里的解析器特指llhttp.

##### 2.2.3.1 http.js如何创建服务
首先来看一个使用http.js模块启动的服务实例：

```js
const http = require('http');

const server = http.createServer((req, res) => {
  console.log('new request');// 某个新请求到来
  req.on('data', (data) => {
    console.log('data received');// 请求的数据到来。
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain');
    res.end('Hello World');
  })
});

server.listen(3000);
```

我们发送以下两个请求：
* post请求，body大小为2M
* get请求。

那么后台服务打印的日志将会如下：
// todo 请求顺序验证
```txt
new request
data received
data received
...
data received
new request
```
可以看到，post类型的请求，触发了req.on('data', cb)中的回调，而get类型的请求则不会触发。

接下来我们从源码解读为什么是这样。首先看入口代码http.createServer：
```js
// 文件位置：/lib/http.js
const {...
  Server,
  ...
} = require('_http_server');
function createServer(opts, requestListener) {
  return new Server(opts, requestListener);
}
```
此处的Server，是_http_server.js中的一个构造函数：

```js
// 文件位置：/lib/_http_server.js
const net = require('net');
...
function Server(options, requestListener) {
  ...
  net.Server.call(this, { allowHalfOpen: true });
  ...
  if (requestListener) {
    this.on('request', requestListener);
  }
  ...
  this.on('connection', connectionListener);
  ...
}
ObjectSetPrototypeOf(Server.prototype, net.Server.prototype);
ObjectSetPrototypeOf(Server, net.Server);
...
module.exports = {
  ...
  Server,
  ...
};
```

可以看到，_http_server.js的Server，是基于net.Server的。

##### 2.2.3.2 新tcp建立后，触发哪个回调？
在上一章中的“2.4 OnConnection”小节中，我们知道，一个新tcp连接建立后，服务调用了net.js中的onconnection函数。
```js
// 文件位置：/lib/net.js
function onconnection(err, clientHandle) {
  ...
  self.emit('connection', socket);
}
```
这里触发了connection事件。

在上一章中，通过net.createServer创建的服务实例，我们注意到，在net.js中的Server构造函数中，有注册一个connection事件，代码如下：
```js
function Server(options, connectionListener) {
    ...
  if (typeof options === 'function') {
    connectionListener = options;
    options = {};
    this.on('connection', connectionListener);
  } else if (options == null || typeof options === 'object') {
    options = { ...options };

    if (typeof connectionListener === 'function') {
      this.on('connection', connectionListener);
    }
  }
  ...
}
```

然而，很遗憾，通过http.createServer创建的服务实例，虽然继承了net.Server，但是都不满足以上代码中if /else if的条件。也就是说，http.createServer中，并没有注册connection事件。

那到底是哪里注册了connection事件呢？

别着急。_http_server.js中的Server，额外做了以下两处设置：
* this.on('request', requestListener);
* this.on('connection', connectionListener);

真相就在这里了。http.createServer创建的服务实例，自己额外注册了一个connection事件。回调则是_http_server.js中的connectionListener函数。

我们来看下_http_server.js中的connectionListener是什么。

```js
// 文件位置：/lib/_http_server.js
function connectionListener(socket) {
  defaultTriggerAsyncIdScope(
    getOrSetAsyncId(socket), connectionListenerInternal, this, socket
  );
}

function connectionListenerInternal(server, socket) {
  ...
  socket.server = server;
  const parser = parsers.alloc();
  parser.socket = socket;
  socket.parser = parser;
  ...
  const parser = parsers.alloc(); // 分配一个解析器
  ...

  if (socket._handle && socket._handle.isStreamBase &&
      !socket._handle._consumed) {
    parser._consumed = true;
    socket._handle._consumed = true;
    parser.consume(socket._handle);
  }
  
}
```

从上面代码看到，当一个tcp连接来了以后，回调函数做了两件事情：

* 分配一个parser（即llhttp解析器）
* 设置请求流的消费方式：parser.consume(socket._handle);

首先是分配解析器。nodejs服务启动时，会先设置1000个大小的解析器池子，当用到的时候就从中取一个。（这部分内容本章节暂不展开，用户只需要知道就行）。

接着是设置消费方式。我们看下parser.consume做了啥。

```c++
// 文件位置： /src/node_http_parser.cc
static void Consume(const FunctionCallbackInfo<Value>& args) {
    ...
    stream->PushStreamListener(parser);
  }

// 文件位置： /src/stream_base-inl.h
void StreamResource::PushStreamListener(StreamListener* listener) {
  ...
  listener_ = listener;
}
```
可以看到，主要是将parser赋给了一个变量listener_。

可能读者还是没能搞清楚，把parser赋给/src/stream_base-inl.h中的listener_，有啥意义呢？

别着急，我们接着看。

##### 2.2.3.3 OnStreamRead
在上一章中，我们知道，当客户端实例分配后，如果该客户端实例上有用户发起请求，那么将会按照如下链路调用：
uv__stream_io -> uv__read -> stream->read_cb (也就是OnUvRead）

```c++
// 文件位置：/deps/uv/src/unix/stream.c
static void uv__read(uv_stream_t* stream) {
  uv_buf_t buf;
  ...
  while (stream->read_cb
      && (stream->flags & UV_HANDLE_READING)
      && (count-- > 0)) {
    assert(stream->alloc_cb != NULL);

    buf = uv_buf_init(NULL, 0);
    // 分配内存，并没有真正从stream中读数据
    stream->alloc_cb((uv_handle_t*)stream, 64 * 1024, &buf);
    ...
    if (!is_ipc) {
      do {
        // 开始真正从stream中读数据
        nread = read(uv__stream_fd(stream), buf.base, buf.len);
      }
      while (nread < 0 && errno == EINTR);
    } else {
      ...
    }

    if (nread < 0) {
      
    } else if (nread == 0) {
      
    } else {
      ...
      // 已经从stream中读取一个64 * 1024大小的数据，并放到了buf中
      // 调用read_cb，通知上层，并把数据传过去
      stream->read_cb(stream, nread, &buf);
      ...
    }
  }
}
```
可以看到，uv__read首先分配一个内存buf，然后从stream流中读取64*1024 = 64k大小的数据。然后把这块数据传给stream->read_cb。

stream->read_cb就是OnUvRead，
```c++
// 文件地址：/src/stream_wrap.cc 
void LibuvStreamWrap::OnUvRead(ssize_t nread, const uv_buf_t* buf) {
  ...
  EmitRead(nread, *buf);
}

可以看到，这里就是把读取到的buf数据，继续往上传。

// 文件地址：/src/stream_base-inl.h
void StreamResource::EmitRead(ssize_t nread, const uv_buf_t& buf) {
  DebugSealHandleScope handle_scope(v8::Isolate::GetCurrent());
  if (nread > 0)
    bytes_read_ += static_cast<uint64_t>(nread);
  listener_->OnStreamRead(nread, buf);
}
```

上一节中，我们知道，tcp连接建立时，把解析器parser赋给/src/stream_base-inl.h中的listener_。

因此，这里的listener_->OnStreamRead(nread, buf),将会触发node_http_parser.cc中的OnStreamRead。（而不是/src/stream_base.cc中的OnStreamRead）

```c++
// 文件位置： /src/node_http_parser.cc
void OnStreamRead(ssize_t nread, const uv_buf_t& buf) override {
    ...
    Local<Value> ret = Execute(buf.base, nread);
    ...
  }
Local<Value> Execute(const char* data, size_t len) {
    ...
    if (data == nullptr) {
      err = llhttp_finish(&parser_);
    } else {
      err = llhttp_execute(&parser_, data, len);
      Save();
    }
    ...
  }

```

可以看到，程序开始调用Execute，这个Execute调用llhttp_execute，开始正式解析request请求。

##### 2.2.3.4 解析器运行原理

而从上面的分析可以看到，传递给解析器的，是从stream中读到的1024 * 64大小的数据。解析器开始对这一块数据进行解析。

那么我们可以得出一个结论：解析器不会调用底层指令，它接受一段数据，然后对它进行结构化分析（解析）。

这一点可以从llhttp的官方样例中得到验证：
```c++
// llhttp官方样例
#include "llhttp.h"

llhttp_t parser;
llhttp_settings_t settings;

/* Initialize user callbacks and settings */
llhttp_settings_init(&settings);

/* Set user callback */
settings.on_message_complete = handle_on_message_complete;

/* Initialize the parser in HTTP_BOTH mode, meaning that it will select between
 * HTTP_REQUEST and HTTP_RESPONSE parsing automatically while reading the first
 * input.
 */
llhttp_init(&parser, HTTP_BOTH, &settings);

/* Parse request! */
const char* request = "GET / HTTP/1.1\r\n\r\n";
int request_len = strlen(request);

enum llhttp_errno err = llhttp_execute(&parser, request, request_len);
if (err == HPE_OK) {
  /* Successfully parsed! */
} else {
  fprintf(stderr, "Parse error: %s %s\n", llhttp_errno_name(err),
          parser.reason);
}
```

在上面样例代码中，传递给llhttp_execute，是“const char* request = "GET / HTTP/1.1\r\n\r\n";”这样一段数据。

这里的解析器本质是一个有限状态，不断解析字符；当解析到特地位置时，便会触发相应的回调。

你可能想到的是，当解析完头部时（碰到空白行），应该会触发一个回调吧。

你猜对了，llhttp会触发一个parserOnHeadersComplete调用。

```js
// 文件位置： /lib/_http_common.js
function parserOnHeadersComplete(versionMajor, versionMinor, headers, method,
                                 url, statusCode, statusMessage, upgrade,
                                 shouldKeepAlive) {
  ...
  const ParserIncomingMessage = (socket && socket.server &&
                                 socket.server[kIncomingMessage]) ||
                                 IncomingMessage;

  const incoming = parser.incoming = new ParserIncomingMessage(socket);
  ...
  return parser.onIncoming(incoming, shouldKeepAlive);
}
```
在这里，创建一个IncomingMessage实例，并调用parser.onIncoming。


```js
// 文件位置：/lib/_http_server.js
...
parser.onIncoming = parserOnIncoming.bind(undefined, server, socket, state);
...
function parserOnIncoming(server, socket, state, req, keepAlive) {
  ...
  state.incoming.push(req);

  const res = new server[kServerResponse](req);
  ...
    server.emit('request', req, res);
}
```

可以看到，这里触发了一个request事件。此处的req，就是刚刚创建的IncomingMessage实例

回忆一下，在本章"2.2.3.1 http.js如何创建服务"小节中，我们设置了一个事件：
```js
// 文件位置：/lib/_http_server.js
...
function Server(options, requestListener) {
  ...
  if (requestListener) {
    this.on('request', requestListener);
  }
  ...
}
```
因此，llhttp解析完头部，调用 parserOnHeadersComplete，parserOnIncoming 后，便触发了request事件。

this.on('request', requestListener)中的requestListener，就是业务代码中的回到函数

```js
// 业务代码
const http = require('http');

const server = http.createServer((req, res) => {
  console.log('new request');// 某个新请求到来
  req.on('data', (data) => {
    console.log('data received');// 请求的数据到来。
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain');
    res.end('Hello World');
  })
});

server.listen(3000);
```

> 小结：
> 当接收到一个新的req请求时，首先先读取64k大小的数据，传给llhttp解析。
> llhttp解析完头部后，触发parserOnHeadersComplete，然后调用parserOnIncoming。
> parserOnIncoming则触发一个“request”事件，接着调用业务代码中回调函数（即http.createServer入参函数）。

这个回调函数requestListener，它有两个入参：req, res。

这个req，是/lib/_http_incoming.js中的IncomingMessage实例，并不是客户端实例（socket实例）。

然后在req下注册了一个data事件。

由于req是一个readable stream实例，因此它的on方法是有特殊含义的，我们来看下
```js
//文件位置：/lib/_stream_readable.js
Readable.prototype.on = function(ev, fn) {
  const res = Stream.prototype.on.call(this, ev, fn);
  ...

  if (ev === 'data') {
    ...
      this.resume();
  } else if (ev === 'readable') {
    ...
  }

  return res;
};
```

可以看到，除了调用Stream基类的on注册事件外，还额外调用了this.resume()。

这个this.resume()会在下一个tick中，调用flow方法，触发stream.push(),最终触发“data”事件。(emit('data'))。

> 我们知道，uv__read一次读取了64k大小的数据；所以如果请求中有body数据，那么这第一次读取就读取了部分或者全部的body数据。
> 因此，我们这里就立刻尝试通过this.resume()触发一次“data”事件。

![img 图片](./img/bodyFirstRead.png)

如果body数据过大，那么第一次读取只能读取一部分。接下来，会进行第二次，第三次读取（同样也是一次读取64k），直到把数据全部读取完毕。

那么第二次，第三次等读取到64k，怎么触发“data”事件呢？

我们来做一个实验，发送一个body大小为2Mb的请求。同时打断点，看下第二次读取数据后，解析器解析完成后，做了啥。

![img 图片](./img/callOnBody.png)

可以看到，llhttp调用了node_http_parser.cc中的on_body函数。

```c++
// 文件位置：/src/node_http_parser.cc
int on_body(const char* at, size_t length) {
    ...
    Local<Value> cb = obj->Get(env()->context(), kOnBody).ToLocalChecked();
    ...

    Local<Value> argv[3] = ...

    MaybeLocal<Value> r = MakeCallback(cb.As<Function>(),
                                       arraysize(argv),
                                       argv);

    ...
  }

```
可以看到，on_body 调用了一个kOnBody的回调函数。这个函数是什么呢？

这个函数，是在初始化解析器池子的时候设置的，代码如下：
```js
// 文件位置：/lib/_http_common.js
// 解析器池子初始化时，设置parser[kOnBody] = parserOnBody;
const parsers = new FreeList('parsers', 1000, function parsersCb() {
  const parser = new HTTPParser();
  ...
  parser[kOnBody] = parserOnBody;
  ...
  return parser;
});
function parserOnBody(b, start, len) {
    ...
    const ret = stream.push(slice);
    ...
  }
}
```
可以看到，这里最终调用了我们熟悉的stream.push(slice);  （stream.push会触发“data”事件）

![img 图片](./img/bodyAfterFirst.png)
> 小结：
> 对于大body类型的请求，第一次读取64k数据，其中的body部分，会通过this.resume()，调用flow方法，触发stream.push(),最终触发“data”事件。(emit('data'))；
> 后续第二次，第三次，会通过node_http_parser.cc中的on_body来调用stream.push(slice)，最终触发“data”事件。

# 四.总结：

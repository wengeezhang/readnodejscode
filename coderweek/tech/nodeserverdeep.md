
[TOC]

# 源码解读nodejs服务启动以及工作

本文将从底层源码（C++/Js）分析一个普通的nodejs服务启动和工作的全部过程

（nodejs源码基于nodejs 14版本)；

## 回顾一下nodejs如何启动服务
按照nodejs官网上的样例，启动一个服务如下：
```js
const http = require('http');

const hostname = '127.0.0.1';
const port = 3000;

const server = http.createServer((req, res) => {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain');
  res.end('Hello World');
});

server.listen(port, hostname, () => {
  console.log(`Server running at http://${hostname}:${port}/`);
});
```
这里使用了nodejs原生模块http来启动一个服务；

实际上，http模块是依赖于nodejs的另外一个原生模块net。

我们可以看下net启动一个服务，是什么样子呢？我们看下直接使用net启动一个服务的样例：

```js
// 1.引入net
const net = require('net');
// 2.创建一个服务
const server = net.createServer((c) => {
  // 'connection' listener.
  console.log('client connected');
  c.on('end', () => {
    console.log('end');
  });
  c.on('data', () => {
      console.log('data event');
      c.write('HTTP/1.1 200 OK\r\n');
        c.write('Connection: keep-alive\r\n');
        c.write('Content-Length: 12\r\n');
        c.write('\r\n');
        c.write('hello world!');
  })
});
server.on('error', (err) => {
  throw err;
});
// 3.监听端口
server.listen(9090, () => {
  console.log('server bound');
});
```

分析一下过程：
* 引入net模块
* 调用net.createServer创建一个服务
* 监听9090端口
  
如果有请求到来，则执行第2步中设置的回调函数。

所以，一个普通的nodejs服务，实际上是由net模块来实现的。

接下来我们就看下net模块的主要功能，以及它是如何启动，并处理客户端请求的。

## 源码解读（涉及net.js, tcp_wrap.cc, libuv等）
### net模块是什么？
* 内建模块
  * nodejs是由c++编写的。核心的处理逻辑，都是c++语言开发的，这些模块官方称为build-in模块；
  * 代码放置在/src目录下。
  * 举例：node.cc, node_file.cc, node_buffer.cc等
* 原生模块
  * 由于nodejs是给js开发者写的，因此又封装了一层js模块给js开发者使用，这部分模块官方称为native模块（相对于js开发者自己写的逻辑模块而言）；
  * 代码放置在/lib目录下。
  * 举例：net.js, http.js, fs.js, util.js等

net模块，即/lib/net.js, 就是原生模块，也叫native模块；是由js语言开发的。

### 如何创建一个服务？
还是刚才的样例：
```js
// connectionListener就是一个普通的回调函数，负责处理业务逻辑。
const server = net.createServer(connectionListener);
```
在/lib/net.js中，net.createServer代码如下：

```js
function createServer(options, connectionListener) {
  return new Server(options, connectionListener);
}
```

可见，createServer是初始化了一个Server的实例。

Server这里是一个构建函数，里面的代码大概50行，但核心主要做了两件事：
* 继承EventEmitter的方法和属性。
* 把创建服务时传入的回调函数connectionListener注册监听一下。this.on('connection', connectionListener);
  
这样，一旦有请求事件过来，则执行connectionListener。

那么此时你一定会想知道，请求事件是怎么传过来的呢？从网卡收到tcp数据包，到执行connectionListener，都经历了哪些过程呢？

接下来我们就来详细分析一下。

### 启动服务过程

一个普通的服务启动，无非要经过以下过程
* 创建一个socket;
* 绑定一个ip地址，即bind();
* 监听端口，即listen();

net.js模块也就是干了这些事情；只不过它把所有这些过程都放在了net.js的listen方法中。
那么我们就来分析一下listen。

#### net模块中listen第一步：首先创建一个tcp服务
抽丝剥茧，listen最终调用了new TCP方法，即build-in模块tcp_wrap.cc模块中的void TCPWrap::New方法。
```js
// lib/net.js中createServerHandle函数，大概1218行。
handle = new TCP(TCPConstants.SERVER);
```

new TCP做了啥？
```js
// 调用 TCPWrap; /src/tcp_wrap.cc
new TCPWrap(env, args.This(), provider);
```

new TCPWrap则调用了libuv的uv_tcp_init

```js
int r = uv_tcp_init(env->event_loop(), &handle_);
```
uv_tcp_init是libuv的一个方法。

libuv是一个异步I/O的多平台支持库。当初主要是为了 Node.js而诞生；但它也被用在 Luvit 、 Julia 、 pyuv 和 其他项目 。

libuv全局管理一个handle，即loop，所有的异步处理对象，都会挂载到loop下，以方便需要时，直接从loop下查找。

我们看看uv_tcp_init做了啥：
```js
// 第一个参数，env->event_loop()即使loop对象；
// 第二个参数 &handle是全局唯一的服务对象，是一个uv_tcp_t实例
int r = uv_tcp_init(env->event_loop(), &handle_)
```
uv_tcp_init最终调用了uv_tcp_init_ex(位于/src/deps/uv/src/unix/tcp.c 114行)。
```js
// 由于tcp是基于stream实现的，因此这里先进行初始化
// 位于/src/deps/uv/src/unix/tcp.c 125行
uv__stream_init(loop, (uv_stream_t*)tcp, UV_TCP);
```
uv__stream_init做了啥呢？他先把steam挂载到loop下，然后执行一系列的初始化操作，最终将stream下的观察者进行初始化

```js
// 以下代码片段，从/src/deps/uv/src/unix/stream.c 85行开始
// 把stream挂载到loop下
uv__handle_init(loop, (uv_handle_t*)stream, type);

// 把stream下的一些属性进行初始化赋值
...

// 初始化stream下的观察者
uv__io_init(&stream->io_watcher, uv__stream_io, -1);
```
至此，libuv把初始化操作都做完了。总结一下初始化做了哪些事情：
* 把服务对象（tcp服务，也就是stream）挂载到loop下。
* 然后对stream执行一系列的初始化操作。

#### net模块中listen第二步：接着调用libuv的bind
这里很简单，不做展开

#### net模块中listen第三步：最后调用libuv的listen
libuv的listen做了很多事情：
* 首先调用底层的listen
* 然后调用uv__io_start，把前面创建的stream的io观察者，放到loop的watcher_queue中

至此，nodejs服务启动阶段完成。接下来，我们分析有客户端请求到来时，nodejs服务是如何处理的。

### 处理请求过程
nodejs使用C++开发的。因此nodejs服务，就是一个C++的进程在跑。

这个进程中，只有一个线程。

我们来看下，这个线程都在跑什么代码逻辑。

* （node_main.cc入口处）调用node.cc中的Start
* node.cc中的Start，初始化一个main_instance，然后调用main_instance.Run()
* node_main_instance.cc中，Run开启一个无限循环，不断调用uv_run();

（当然实际代码逻辑远远超过这些，感兴趣的同学可以自己看下源码。）

可以看到，进程启动起来以后，在不断地调用uv_run，那么uv_run是干啥呢？

```js
// 位于/src/deps/uv/src/unix/core.c
int uv_run(uv_loop_t* loop, uv_run_mode mode) {
  int timeout;
  int r;
  int ran_pending;

  r = uv__loop_alive(loop);
  if (!r)
    uv__update_time(loop);

  while (r != 0 && loop->stop_flag == 0) {
    uv__update_time(loop);
    uv__run_timers(loop);
    ran_pending = uv__run_pending(loop);
    uv__run_idle(loop);
    uv__run_prepare(loop);

    timeout = 0;
    if ((mode == UV_RUN_ONCE && !ran_pending) || mode == UV_RUN_DEFAULT)
      timeout = uv_backend_timeout(loop);

    uv__io_poll(loop, timeout);
    uv__run_check(loop);
    uv__run_closing_handles(loop);
    ...
  }
  ...
}
```

是不是很熟悉，其实就是libuv官网中的这张图
![alt 图片](../../img/uv_run.png)

我们重点关注uv__io_poll这个阶段，看看它到底是怎么判断【某个请求已经就绪，可以执行回调了】。

#### uv__io_poll做了啥？
uv__io_poll封装了个个平台的差异性（linux下使用epoll， mac下使用kqueue...）。我们以linux的epoll为例。

下面是简要步骤：
* uv__io_poll会从loop->watcher_queue中取出一个（上面我们有分析，node服务启动后，会把服务注册到这个队列中，参见“net模块中listen第三步：最后调用libuv的listen”）。

* 取出后，调用epoll的epoll_ctl方法，表示我对这个服务的句柄感兴趣，告诉epoll：你帮我盯着。

* 然后调用epoll的epoll_pwait方法（这里会阻塞一会），拿到已经准备就绪的事件。

* 最后调用每个服务的回调： w->cb(loop, w, pe->events)  （这里的w就是第一步中从watcher_queue中取出来的东西）

w->cb是什么呢？
其实，它是在服务启动时，调用libuv的uv_tcp_listen时设置的。
```js
// 位于/src/deps/uv/src/unix/tcp.c 363行
tcp->io_watcher.cb = uv__server_io;
```

uv__server_io是stream.c中的一个方法，主要做了以下这件事：
```js
// 位于/src/deps/uv/src/unix/stream.c 564行
stream->connection_cb(stream, err);
```
而这个stream->connection_cb，就是业务开发人员，启动服务时，设定的connectionListener回调，证据：
```js
// 位于/src/deps/uv/src/unix/tcp.c 3359行
// 这个connection_cb，和cb关联了起来。此处的cb，就是业务开发设定的connectionListener
tcp->connection_cb = cb;
```
（注：stream->connection_cb的stream和tcp->connection_cb的tcp是一个东西）。


到此，libuv的uv__io_poll完成了监听网络事件，并调用服务回调的过程。

总结一下：

* 把业务服务注册到epoll中。
* epoll监测到事件，然后调用业务开发指定的回调。

### 如何处理高并发？

经过上面的分析，你可能大概了解了一个请求的整个处理过程。但是nodejs服务又是怎么处理高并发呢？

带着整个疑问，我们来一一分析。

我们先来设置一个场景：

* 有个用户A,串行发送5个请求到服务器；几乎在同一时间点，另外一个用户B,串行发送10个请求到服务器。
* 该服务器处理每个请求的时间需要20ms（假设）。

此时服务器会收到15个请求（15 requests）;但是由于目前都是长连接，所以服务端其实只收到了两个连接（2 connections）。总结一下：
* 2个connections
* 15个requests（第一connection 5个，第二个connection10个）

每个tcp connection到来时，都会根据请求包中的目标ip和端口，找到对应的socket；然后完成三次握手，最后进入该socket下的accept_queue队列中。

那么此时我们的nodejs服务对应的socket的accept_queue中，就会有两个connection。

此时libuv运行uv__io_poll, 最终调用epoll_wait。由于此socket中有连接到来，因此epoll_wait返回的一批fds中，就包含我们服务socket的fd。

接着，我们对此fd，执行它的回调（w->cb）。

这个回调，也即是stream.c中的uv__server_io中，它会执行一个while循环，一直调用accept()，拿到所有的连接（此样例中，就是拿到用户A和B的两个连接），直到accept()返回-1（表示accept_queue中没有啦）。

在这个循环中，每拿到一个连接，便执行业务开发设置的回调函数connectionListener。

比如，我们先拿到了用户A的连接，然后执行connectionListener();
回忆一下connectionListener干了啥
```js
// connectionListener就是net.createServer的那个函数参数
// 这里的c就是clientSocket，即一个client tcp connection
const server = net.createServer((c) => {
  // 'connection' listener.
  console.log('client connected');
  c.on('end', () => {
    console.log('end');
  });
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

样例代码中的c，就是用户A发起的那个tcp连接。虽然用户A发起了5个请求，但是都是共用这一个tcp连接。

因此：
* console.log('client connected');  会执行一次。
* console.log('data event'); 会执行5次。

那么你会问，c.on('data')是怎么拿到数据的呢？这个客户端连接有数据时，是怎么触发这个data事件呢？

### 拿到客户端连接后，怎么处理？
上一节中，我们分析了一个服务如何拿到客户端的连接。拿到了客户端连接，并不一定表示马上有数据。客户端可能只是先发起一个连接，但是隔了10ms~1分钟，才发送真正的数据。

由于10ms~1分钟，甚至更久，这个时间是不确定的。服务又不能干等着，因此必须把这个client connection也交给libuv（最终交给epoll）来盯着。

我们来看看代码，详细分析。

#### 客户端连接封装
服务收到客户端连接时，会最终调用net.js中的onconnection。
```js
const socket = new Socket({
  handle: clientHandle,
  allowHalfOpen: self.allowHalfOpen,
  pauseOnCreate: self.pauseOnConnect,
  readable: true,
  writable: true
});

self._connections++;
socket.server = self;
socket._server = self;

DTRACE_NET_SERVER_CONNECTION(socket);
// 事先创建服务时，有注册一个on('connection')，这里触发
self.emit('connection', socket);
```
可见，这个客户端连接，就是封装了一个Socket。

net.js中的Socket继承了EventEmiter, 业务代码中的on('data')就是由此而来。

```js
// 这里的c，就是socket = new Socket()
const server = net.createServer((c) => {
  ...
  c.on('data', () => {
    ...
  })
});
```

我们知道EventEmiter比较简单，通过on注册事件，然后通过emit触发事件。那么可以断定，在某个时候，触发了emit('data', clientData)。

什么时候，在什么地方，由谁触发的emit('data', clientData)呢？

我们继续分析。

#### 将客户端连接注册到epoll中
客户端连接是通过
```js
// clientHandle就是相对底层的客户端tcp connection。
const socket = new Socket({
  handle: clientHandle,
  allowHalfOpen: self.allowHalfOpen,
  pauseOnCreate: self.pauseOnConnect,
  readable: true,
  writable: true
});
  ```
创建的。

在Socket初始化的时候，又调用一个read,不过指明读取0个长度
```js
// options.handle就是clientHandle
// 赋值给socket下的_handle，以备后用
function Socket(options) {
  this._handle = options.handle;
  ...
  // 接着调用read
  this.read(0);
}
  ```

由于socket继承了Stream，因此这里的read是Stream下的一个方法；由于是读取，因此我们去/lib/_stream_readable.js中找到read方法。

```js
Readable.prototype.read = function(n) {
  ...
  // Call internal read method
  this._read(state.highWaterMark);
}
```
而这个this._read就是net.js中Socket下的一个方法

```js
Socket.prototype._read = function(n) {
  debug('_read');

  if (this.connecting || !this._handle) {
    debug('_read wait for connection');
    this.once('connect', () => this._read(n));
  } else if (!this._handle.reading) {
    tryReadStart(this);
  }
};
```

它调用了tryReadStart(同样位于net.js中)

```js
function tryReadStart(socket) {
  // Not already reading, start the flow
  debug('Socket._handle.readStart');
  socket._handle.reading = true;
  const err = socket._handle.readStart();
  if (err)
    socket.destroy(errnoException(err, 'read'));
}
```
可以看到，它最终调用了socket._handle.readStart()。这个socket._handle就是Socket初始化时，保存的客户端clientHandle。

那么socket._handle.readStart方法是什么呢？它位于/src/stream_wrap.cc中:

```js
int LibuvStreamWrap::ReadStart() {
  return uv_read_start(stream(), [](uv_handle_t* handle,
                                    size_t suggested_size,
                                    uv_buf_t* buf) {
    static_cast<LibuvStreamWrap*>(handle->data)->OnUvAlloc(suggested_size, buf);
  }, [](uv_stream_t* stream, ssize_t nread, const uv_buf_t* buf) {
    static_cast<LibuvStreamWrap*>(stream->data)->OnUvRead(nread, buf);
  });
}
```

可以看到，它调用了uv_read_start。

uv_read_start源码（/src/deps/uv/src/unix/stream.c中）：
```js
// 这里的stream，其实就是clientHandle。
int uv_read_start(uv_stream_t* stream,
                  uv_alloc_cb alloc_cb,
                  uv_read_cb read_cb) {
  ...
  uv__io_start(stream->loop, &stream->io_watcher, POLLIN);
  ...
}
```
uv__io_start我们就比较清晰了，它就是把clientHandle的io_watcher挂载到loop下的watcher_queue中，以便在uv__io_poll阶段，被epoll关注。

到此为止，客户端连接clientHandle算是成功注册到epoll啦。

#### epoll怎么触发emit('data')?

我们知道，在uv__io_poll阶段，epoll_wait拿到有事件的fd后，调用了w->cb(loop, w, pe->events);

这个w->cb我们重点关注一下。

* 一个普通的stream，w->cb是指cb，就是指uv__stream_io；
* 如果是服务端的fd，就会调用listen。uv_tcp_listen会用uv__server_io覆盖w->cb。

我们来看下为什么一个普通的stream（非listen的socket），w->cb会是uv__stream_io.

打断点调试发现：一个新客户端连接来了以后，会调用WrapType::Instantiate
```js
// 在/src/connection_wrap.cc
void ConnectionWrap<WrapType, UVType>::OnConnection(uv_stream_t* handle,
                                                    int status) {
  ...
  WrapType::Instantiate(env, wrap_data, WrapType::SOCKET)
  ...
}
```
WrapType::Instantiate会最终直接初始化一个stream，调用uv__stream_init。

调用栈如下图所示：
![alt 图片](../../img/clientStreamInit.png)

所以此处的w->cb没有被覆盖，还是v__stream_io。

我们看看v__stream_io干啦啥？

```js
static void uv__stream_io(uv_loop_t* loop, uv__io_t* w, unsigned int events) {
  ...
  if (events & (POLLIN | POLLERR | POLLHUP))
    uv__read(stream);
  ...
}
```
它调用了uv__read, uv__read会调用read_cb。

```js
static void uv__read(uv_stream_t* stream) {
  ...
  stream->read_cb(stream, UV_ENOBUFS, &buf);
  ...
```

read_cb最终会调用self.push(buffer);

self.push就是/lib/_stream_readable.js中的方法：

```js
Readable.prototype.push = function(chunk, encoding) {
  return readableAddChunk(this, chunk, encoding, false);
};
```
readableAddChunk方法会调用addChunk();最终触发emit('data');

```js
function addChunk(stream, state, chunk, addToFront) {
    ...
    stream.emit('data', chunk);
    ...
```

到此，on('data',cb)中注册的回调cb得以执行，业务js逻辑开始接手。




## 定时器
敬请期待。。。
## 文件io
敬请期待。。。

## 参考：

https://cloud.tencent.com/developer/article/1630793 （libuv）
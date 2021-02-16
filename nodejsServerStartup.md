解读点：nodejs服务如何启动。

[TOC]


# 一.故事
“10010百货店”要开张营业了，但是所在的市经贸大厦有规定，店铺外面不能张贴任何标识。

为了让客户找到该商店，店主必须制作一些宣传单，在开张前，把宣传单发放到人们手里。

## 1.1宣传单上要写哪些信息呢？

由于市经贸大厦这个地点大家都知道在哪里，任何一个普通市民看到“市经贸大厦”这几个字，就可以不费任何成本找到它；因此，宣传单上首先要写的就是“市经贸大厦”。

但是由于市经贸大厦有很多店铺，要找到“10010百货铺”，只能通过门牌号定位，因此，还要加上门牌号“105号铺”。

因此，宣传单上完整的信息是：“市经贸大厦:105号铺”。

![alt 图片]()

## 1.2开门营业
准备就绪，还剩下最后一个动作，那就是打开店铺大门，开始营业。如果门不开，营业人员不在，那么即使用户通过宣传单上的“市经贸大厦:105号铺”找到了店铺，也将会面临进不去无法交易的结果。
这就相当于一个服务还没启动，或者宕机了，你再怎么访问它，都不会拿到结果。

# 二.分析和对照
在上面的故事中，我们知道店铺要营业，至少需要做两件事：
* 准备宣传单，将宣传单上的店铺信息绑定为：“市经贸大厦:105号铺”
* 开门营业。

那么回到计算机中来，一个服务启动，同样是做两件事

* bind “ip:port”
* listen

## 1.原理分析
我们看下一个传统的C++启动服务的代码

```c++
int serv_sock = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);

struct sockaddr_in serv_addr;
memset(&serv_addr, 0, sizeof(serv_addr));  //每个字节都用0填充
serv_addr.sin_family = AF_INET;  //使用IPv4地址
serv_addr.sin_addr.s_addr = inet_addr("127.0.0.1");  //具体的IP地址
serv_addr.sin_port = htons(1234);  //端口

// serv_addr是一个对象，其下面包含了两个重要的信息：sin_addr.s_addr, sin_port
// 这两个信息，就类似于故事中的“市经贸大厦:105号铺”
// 然后将这两个信息绑定到socket上
bind(serv_sock, (struct sockaddr*)&serv_addr, sizeof(serv_addr));

//进入监听状态，类似于故事中的开门营业
listen(serv_sock, 20);
```

## 2.关联：
通过以上分析，我们把故事中的情节和计算机中的信息做一个关联
* “市经贸大厦” -> 计算器，
* “105号” -> 端口号。
* 开门营业 -> listen

# 三. nodejs源码解读
## 1. 解读入口

按照nodejs官网上的样例，启动一个服务如下：

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

## 2. 源码解读
从上面的入口代码看出，一个普通的nodejs服务，实际上是由net模块来实现的。

那么net模块是什么呢？它属于哪个角色呢？

nodejs源码是由C++和js两部分语言文件组成。其中的模块被划分为两类模块：

* 内建模块（built-in model）
  * 由c++编写的。核心的处理逻辑，都是c++语言开发的，这些模块官方称为build-in模块；
  * 代码放置在/src目录下。
  * 举例：node.cc, node_file.cc, node_buffer.cc等
* 原生模块(native model)
  * 由于nodejs是给js开发者写的，因此又封装了一层js模块给js开发者使用，这部分模块官方称为native模块（相对于开发者自己写的模块）；
  * 代码放置在/lib目录下。
  * 举例：net.js, http.js, fs.js, util.js等

net模块，即/lib/net.js, 就是原生模块，也叫native模块；是由js语言开发的。

接下来，我们看下net模块如何启动一个服务。

### 2.1 创建服务实例
net.createServer的代码逻辑如下：
```js
// 文件地址：/lib/net.js
...
function createServer(options, connectionListener) {
  return new Server(options, connectionListener);
}
...

function Server(options, connectionListener) {
  ...
    this.on('connection', connectionListener);
  ...
}
ObjectSetPrototypeOf(Server.prototype, EventEmitter.prototype);
ObjectSetPrototypeOf(Server, EventEmitter);
...

```

可见，createServer是初始化了一个Server的实例。

Server这里是一个构建函数，里面的代码大概50行，但核心主要做了两件事：
* 继承EventEmitter的方法和属性。
* 把创建服务时传入的回调函数connectionListener注册监听一下。this.on('connection', connectionListener);

这样，一旦有请求事件过来，则执行connectionListener。

那么此时你一定会想知道，请求事件是怎么传过来的呢？从网卡收到tcp数据包，到执行connectionListener，都经历了哪些过程呢？

接下来我们就来详细分析一下。

### 2.2 绑定并监听
上一节我们创建了一个服务实例。这个服务实例还没办法对外服务。

对照故事中的情节，相当于把10010店铺准备好了，但是还没有对外宣传和营业。

店铺是一个实体，它本身可以提供商品交易。但是它自己没办法自己宣传和开张。完成宣传和开张的，是店铺的代理人或者店主。

同样的，我们创建的服务实例，不会自己去绑定并监听端口，而是交给其他模块来完成，这个模块，就是TCP实例。

#### 2.2.1 创建TCP实例
我们再来回顾一下故事中的情节，看下一个普通的服务启动要经过的过程：
* 绑定一个ip:port地址，即bind();
* 监听，即listen();

net.js模块也就是干了这些事情；只不过它把所有这些过程都放在了net.js的listen方法中。

那么我们就来分析一下listen。

```js
// 文件地址：/lib/net.js
...
Server.prototype.listen = function(...args) {
  ...
  listenInCluster(this, null, options.port | 0, 4, backlog, undefined, options.exclusive);
  ...
};

...
// listenInCluster 最后调用了server._listen2
function listenInCluster(server, address, port, addressType, backlog, fd, exclusive, flags) {
  ...
    server._listen2(address, port, addressType, backlog, fd, flags);
    return;
  ...
}

...
Server.prototype._listen2 = setupListenHandle;  // legacy alias
...
```

（注：我们这里把无关的代码省略，主要看主要逻辑）

从以上代码中，可以看到，整个流程为：

listen --> listenInCluster --> server._listen2。

而server._listen2就是setupListenHandle。

小结：
> listen方法其实就是setupListenHandle。

那么我们来看下setupListenHandle。

```js
// 文件： /lib/net.js
function setupListenHandle(address, port, addressType, backlog, fd, flags) {
  ...
      rval = createServerHandle(address, port, addressType, fd, flags);
    ...
    this._handle = rval;
  ...

  this._handle.onconnection = onconnection;
  ...
  const err = this._handle.listen(backlog || 511);

  ...
}

...
function createServerHandle(address, port, addressType, fd, flags) {
  ...
  ...
    handle = new TCP(TCPConstants.SERVER);
  ...

      err = handle.bind(address, port);
  ...

  return handle;
}
...
```
从上面代码可以看出，setupListenHandle做了两件事：
* 调用createServerHandle， 进而创建一个TCP实例，然后绑定ip port(handle.bind(address, port)),并将该实例返回
* 用刚刚返回的实例，调用其listen（注意这里的listen是封装的，详细逻辑后面会展开）

#### 2.2.2 TCP实例创建过程分析

new TCP做了啥？
```C++
// 文件：/src/tcp_wrap.cc
void TCPWrap::New(const FunctionCallbackInfo<Value>& args) {
  ...
  new TCPWrap(env, args.This(), provider);
}

...

TCPWrap::TCPWrap(Environment* env, Local<Object> object, ProviderType provider) : ConnectionWrap(env, object, provider) {
  int r = uv_tcp_init(env->event_loop(), &handle_);
  ...
}

```

可以看到，创建TCP实例，其实是调用了libuv的uv_tcp_init。
>##### libuv简介
>uv_tcp_init是libuv的一个方法。到这里，libuv开始介入。我们先来简单介绍一下libuv:
>
>* libuv是一个异步I/O的多平台支持库。当初主要是为了 Node.js而诞生；但它也被用在 Luvit 、 Julia 、 pyuv 和 其他项目 。
>
>* libuv全局管理一个handle，即loop，所有的异步处理对象，都会挂载到loop下，以方便需要时，直接从loop下查找。

接下来，我们看看uv_tcp_init做了啥：
```c++
// 文件：/src/deps/uv/src/unix/tcp.c
int uv_tcp_init(uv_loop_t* loop, uv_tcp_t* tcp) {
  return uv_tcp_init_ex(loop, tcp, AF_UNSPEC);
}

int uv_tcp_init_ex(uv_loop_t* loop, uv_tcp_t* tcp, unsigned int flags) {
  ...
  uv__stream_init(loop, (uv_stream_t*)tcp, UV_TCP);
  ...
  return 0;
}
```
uv_tcp_init调用了uv_tcp_init_ex, 然后最终调用了uv__stream_init。

>小结：
> TCP创建时，调用流程为：uv_tcp_init-->uv_tcp_init_ex->uv__stream_init。

uv__stream_init做了啥呢？他先把steam挂载到loop下，然后执行一系列的初始化操作，最终将stream下的观察者进行初始化

```C++
void uv__stream_init(uv_loop_t* loop, uv_stream_t* stream, uv_handle_type type) {
  ...
  // 把stream挂载到loop下
  uv__handle_init(loop, (uv_handle_t*)stream, type);
  ... //一些列的stream初始化操作
  // 初始化stream->io_watcher。
  uv__io_init(&stream->io_watcher, uv__stream_io, -1);
}
```
>uv__stream_init小结：
> * 把服务对象（TCP实例，也就是stream）挂载到loop下。
> * 然后对stream执行一系列的初始化操作。

把TCP实例（也就是stream）初始化完成，并挂载到loop下后，就可以真正开始绑定和监听了。

>注：为什么要引入libuv,并把TCP实例挂载到loop下面呢？
可能你会有疑问，我创建了服务，直接调用bind和listen不就行了吗？为什么还要引入libuv，stream，loop，观察者等一系列复杂的概念呢？
>
>原因就是，nodejs服务是单线程的，要处理高并发的请求，就不得不轮询端口是否有请求到来。
>
>那不就是写一个for循环吗？至于引入libuv吗？
>
>是的，本质上就是一个for循环。但是由于不同的操作系统接口各异，因此才诞生了libuv这个兼容性强的库。
>
>关于libuv是如何轮询检测到有请求到来的，将在下一章【nodejs如何处理用户的请求】中展开解读。
#### 2.2.3 绑定（bind）
还记得createServerHandle（第三节 2.2.1小节）中的代码吗？

```js
// 文件地址：/lib/net.js
function createServerHandle(address, port, addressType, fd, flags) {
  ...
  ...
    handle = new TCP(TCPConstants.SERVER);
  ...

      err = handle.bind(address, port);
  ...

  return handle;
}
...
```

创建完TCP实例后（就是handle），进行了bind。
```c++
// 文件地址：/src/tcp_wrap.cc
template <typename T>
void TCPWrap::Bind(...) {
  ...
    err = uv_tcp_bind(&wrap->handle_,
                      reinterpret_cast<const sockaddr*>(&addr),
                      flags);
  ...
}

```
可以看到，这里的bind其实也是调用了libuv的uv_tcp_bind方法。关于libuv的bind方法，本章节先不展开。
#### 2.2.4 监听（listen）
还是先回顾第三节 2.2.1小节中的代码，其中setupListenHandle在创建完实例后，调用了listen方法：

```js
// 文件： /lib/net.js
function setupListenHandle(address, port, addressType, backlog, fd, flags) {
  ...
      rval = createServerHandle(address, port, addressType, fd, flags);
    ...
    this._handle = rval;
  ...

  this._handle.onconnection = onconnection;
  ...
  const err = this._handle.listen(backlog || 511);

  ...
}
```

this._handle就是之前创建的TCP实例，它的listen方法代码如下：

```c++
// 文件： /src/tcp_wrap.cc
...
void TCPWrap::Listen(const FunctionCallbackInfo<Value>& args) {
  ...
  int err = uv_listen(reinterpret_cast<uv_stream_t*>(&wrap->handle_),
                      backlog,
                      OnConnection);
  ...
}
...

// 文件：/deps/uv/src/unix/stream.c
int uv_listen(uv_stream_t* stream, int backlog, uv_connection_cb cb) {
  ...
    err = uv_tcp_listen((uv_tcp_t*)stream, backlog, cb);
  ...
}
```

可以看到，listen最终是调用了libuv的uv_tcp_listen方法。它的代码如下：

```c++
// 文件： /deps/uv/src/unix/tcp.c
int uv_tcp_listen(uv_tcp_t* tcp, int backlog, uv_connection_cb cb) {
  ...
  if (listen(tcp->io_watcher.fd, backlog))
    return UV__ERR(errno);

  tcp->connection_cb = cb;
  tcp->flags |= UV_HANDLE_BOUND;
  ...
  tcp->io_watcher.cb = uv__server_io;
  uv__io_start(tcp->loop, &tcp->io_watcher, POLLIN);

  return 0;
}
```

上面的显示的代码，每一行都很关键。不过这里我们先关注两行代码：
* listen(tcp->io_watcher.fd, backlog)：
    
    首先调用底层的listen
* uv__io_start(tcp->loop, &tcp->io_watcher, POLLIN)：

    然后调用uv__io_start，把前面创建的stream的io观察者（&tcp->io_watcher），放到loop的watcher_queue中

至此，nodejs服务启动阶段完成。

# 四.总结：
一个nodejs服务启动，主要包含三个主要的环节
* 创建服务实例
* 绑定ip：port
* 进行监听，进入工作状态。

但是,在走读代码的过程中，我们还留意到，引入了libuv，创建了TCP实例，并把它挂在到loop下。同时还把TCP实例的观察者（&tcp->io_watcher）挂在到loop的watch_queue对象下。

这些看似琐碎的代码逻辑，却是nodejs的核心关键所在，nodejs就是依赖loop, io_watcher，watch_queue来处理客户端请求的。

那么下一章，我们就来分析有客户端请求到来时，nodejs服务是如何处理的。
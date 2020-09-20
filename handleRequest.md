解读点：nodejs服务如何处理客户端请求。

# 一.故事
现在10010店铺正式开业了。

这天早上，有一位顾客王大妈来到店铺，想要买二斤黄豆。

王大妈一进门，就看到有一道隔离带拦住了她。隔离带后面有一个“红色篮子”，还有一张告示。

告示牌上面写着：
> 请新来的顾客，把您的姓名写在纸条上，放到“红色篮子”里。
> 
> 机器人会自动过来处理的。

![alt 隔离带+告示牌+红色篮子]()
王大妈把自己的名字写在了一张字条上，放到了“红色篮子”里。

“红色篮子”正上方，有一个探测器，王大妈刚放到“红色篮子”里，立马就从里面走过来一个机器人，把“红色篮子”里的字条拿起来。
![alt 红色篮子字条放大+机器人过来]

同时机器人从旁边取了一个“蓝色篮子”，在上面写了一个数字“1”（王大妈是第一位顾客)，然后把“蓝色篮子”放一边，然后在“蓝色篮子”上方也放置了一个新的探测器。放完探测器，机器人转身离开了。

![alt 机器人取分配蓝色篮子]()

这时候，王大妈看到旁边还有个告示牌，说：
> 请分配到“蓝色篮子”的顾客，把你们的需求写在纸条上，放进属于自己的“蓝色篮子”里。
> 机器人会自动处理的。

于是王大妈又写了一张纸条，上面写着：“黄豆，2斤”，放到了分配给自己的篮子里。
![alt 王大妈写字条到蓝色篮子]()
由于有探测器，刚放进去，机器人立马过来了，拿起字条，转身走到后面。
![alt 机器人取字条]()
过了一会，机器人回来了，它把2斤黄豆放到了贴有“1”的“蓝色塑料篮子”里。
![alt 机器人把东西放进蓝色篮子]()
王大妈拿到了黄豆，从店铺里走出来。

# 二.分析和对照
在日常生活中，一个店铺在同一时间，会有很多客人光顾。

并且有一小部分客人只是逛逛就走了，并没有买东西。

因此店铺要精细化运营，要解决以下两个问题：
* 部分客人只是逛逛，并不采购。
* 同一时间很多客人采购。

如果每来一个客人都分配一个导购，将会给店铺经营带来极大的人力成本。

因此，一个理想的模式是，只有在确定某个客人真正要买东西的时候，才分配一名导购给他。

如果确定了“客人要买东西，而且知道了要买什么”，那么剩下的工作就非常“迅速”，夸张一点说，基本不用浪费时间（这个概念希望读者记一下）。

因此，基于这个分析，“10010百货铺”的运营模式就成了上线故事情节中的那样：

* 只有一个机器人
* 客人到店后，如果确定要买东西，就写上自己的名字，放到“红色篮子里”，如果不买，就不用写。
* 机器人检测到有人要买东西，就给他/她分配一个“蓝色篮子”
* 客人再把自己的采购需求放到“蓝色篮子里”
* 机器人完成采购，放到“蓝色篮子里”，客户离开。

## 1.原理分析
nodejs服务器也是这样。nodejs只有一个主线程，它要负责所有的工作。

它会实施检测是否有tcp请求到来，如果有，就创建一个socket(代表client)。然后就基于这个client socket和客户端进行通信

## 2.关联
在这个故事情节中，王大妈相当于一个TCP，她的需求“黄豆，2斤”,相当于请求的参数；

机器人相当于nodejs主线程

* 王大妈    -->  TCP 通信链接
* 黄豆，2斤 --> body：{material: "黄豆", number: "2斤"}
* 机器人   --> nodejs主线程

# 三. nodejs源码解读
## 1. 解读入口
nodejs使用C++开发的。因此nodejs服务，就是一个C++的进程。

这个进程中，只有一个主线程在跑。
>线程池的概念我们后续再展开

我们先来看进程启动的简要步骤：

* node_main.cc（入口）：调用node.cc中的Start
* node.cc：Start函数初始化一个main_instance，然后调用main_instance.Run()
* node_main_instance.cc：Run函数开启一个无限循环，不断调用uv_run();

> 当然实际代码逻辑远远超过这些，进程启动的详细过程在后面章节中详细介绍。

可以看到，进程启动起来以后，在不断地调用uv_run，那么uv_run是干啥呢？

```js
// 位于/src/deps/uv/src/unix/core.c
int uv_run(uv_loop_t* loop, uv_run_mode mode) {
  ...

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

我们重点关注uv__io_poll，这个节段就是处理一个tcp请求的核心所在。

## 2. 源码解读
### 2.1 uv__io_poll
uv__io_poll封装了平台的差异性（linux下使用epoll， mac下使用kqueue, windows下是iocp）。我们以linux的epoll为例来解读。

```c++
// 文件地址：/deps/uv/src/unix/linux-core.c
void uv__io_poll(uv_loop_t* loop, int timeout) {
  // 1.设置一堆必要的变量
  ...
  // 2.从loop下的watcher_queue依次取出一个观察者对象（在上一章节nodejs服务启动时，曾经创建了一个服务实例，并把该服务实例的观察者挂载到了loop->watcher_queue下）
  while (!QUEUE_EMPTY(&loop->watcher_queue)) {
    q = QUEUE_HEAD(&loop->watcher_queue);
    ...

    w = QUEUE_DATA(q, uv__io_t, watcher_queue);
    ...
      // 3.注册到epoll中
      epoll_ctl(loop->backend_fd, op, w->fd, &e)
    ...
  }
  ...
  // 4.开启一个无限循环，监听epoll
  for (;;) {
    ...
    // todo 断点确定一下epoll_wait是否是走这个分支
      // 4.1.调用epoll_wait，获取有请求到来的服务实例
      nfds = epoll_wait(loop->backend_fd,
                        events,
                        ARRAY_SIZE(events),
                        timeout);
    ...
    // 4.2.依次调用服务实例的回调函数：w->cb
    for (i = 0; i < nfds; i++) {
      pe = events + i;
      fd = pe->data.fd;
      ...
      w = loop->watchers[fd];

      ...
          w->cb(loop, w, pe->events);
      ...
    }
    ...
  }
}

```

我们把以上代码中的注释集中起来,看一下uv__io_poll的工作：
* 1.设置一堆必要的变量
* 2.从loop下的watcher_queue依次取出一个观察者对象（在上一章节nodejs服务启动时，曾经创建了一个服务实例，并把该服务实例的观察者挂载到了loop->watcher_queue下）
* 3.注册到epoll中
* 4.开启一个无限循环，监听epoll
  * 4.1 调用epoll_wait，获取有请求到来的服务实例
  * 4.2.依次调用回调函数：w->cb

> 注：为了简单易懂，以上分析仅仅以tcp请求为例。


部分读者可能会有疑问，明明我的nodejs服务只有一个实例，为什么不直接把这服务实例注册到epoll中，还非得搞一个while循环，再加一个for循环，不是搞复杂了吗？

难道除了我的这个nodejs服务实例，还有别的需要监听关注吗？

答案是yes。

但是背后的设计理念远不止这一点, 我们看下主要的几个原因:

* 首先一个nodejs进程，可以启动多个不同的服务实例
  >const svr1 = net.createServer(cb1);
  >const svr2 = net.createServer(cb2);
  >svr1.listen(8080);
  >svr2.listen(9090)
  >
  >svr1和svr2是两个完全不相关的服务，但是却跑在一个nodejs进程中，公用一个libuv。
* 每个服务实例，有可能访问其他服务，会产生很多请求型的socket需要监听。
* libuv虽然是为nodejs而诞生的，但是它现在已经成为通用的i/o库，被更多的产品使用（ Node.js, Luvit, Julia, pyuv, and others），这就要求它必须兼容所有的应用形式。

所以，我们的服务实例虽然只有一个，但还是会统一放进libuv的观察者队列中去，由libuv统一去处理。

> 对照关联：
> 回忆一下故事情节中的“红色篮子”。我们的服务实例的观察者对象（tcp->io_watcher）就相当于故事中的“红色篮子”。
### 2.2.2 w->cb

在上一节中，在有请求到来时，程序调用了w->cb。这个回调函数cb是什么呢？它主要的工作是干什么呢？

在第一章中，服务启动，我们分析了listen最终调用了uv_tcp_listen。我们这里再把那段代码贴出来看看
```C++
// 文件地址： /deps/uv/src/unix/tcp.c
int uv_tcp_listen(uv_tcp_t* tcp, int backlog, uv_connection_cb cb) {
  ...
  if (listen(tcp->io_watcher.fd, backlog))
    return UV__ERR(errno);

  tcp->connection_cb = cb;
  tcp->flags |= UV_HANDLE_BOUND;
  ...
  // 设置cb = uv__server_io
  tcp->io_watcher.cb = uv__server_io;
  uv__io_start(tcp->loop, &tcp->io_watcher, POLLIN);

  return 0;
}
```
> 注：stream->connection_cb的stream和tcp->connection_cb的tcp是一个东西。

看看上面代码中的有注释的那一行代码（tcp->io_watcher就是本章节分析中的w），可以看出：

这个回调函数cb就是uv__server_io。

> 总结：
> 有请求到来时，程序会调用uv__server_io。


uv__server_io是stream.c中的一个方法，我们来看下它的代码：
```js
// 文件地址：/src/deps/uv/src/unix/stream.c
void uv__server_io(uv_loop_t* loop, uv__io_t* w, unsigned int events) {
  ...
    err = uv__accept(uv__stream_fd(stream));
    ...
    stream->accepted_fd = err;
    stream->connection_cb(stream, 0);

    ...
}
```
首先看uv__accept(uv__stream_fd(stream))：

这行代码表示，接受客户端请求，创建一个客户端socket（并把新创建的客户端socket的fd，临时保存在服务实例下）

> 对照关联：
> 回忆一下故事情节中，机器人从“红色篮子”里面拿出一个字条，并分配了一个“蓝色篮子”给王大妈。
> 这里的uv__accept，就类似于这个过程，新创建的客户端socket,就是“蓝色篮子”。

然后再看stream->connection_cb(stream, 0)：

这行代码，会把新创建的客户端socket，注册到epoll下观测起来。
> 对照关联：
> 故事情节中，机器人给王大妈分配一个“蓝色篮子”后，在篮子上方放置了一个探测器。这个放置探测器的动作，就类似于把新创建的客户端注册到epoll。

### 2.2.3 stream->connection_cb
我们来看下stream->connection_cb这个函数，是怎么把新创建的客户端socket，注册到libuv下的。

回顾第一章中，监听端口的代码：
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

可以看到，它调用了uv_listen，并传入了一个参数OnConnection,然后参数传递给uv_tcp_listen。

```C++
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

在这里，我们看到，tcp->connection_cb = cb;  这里的cb就是uv_listen(reinterpret_cast<uv_stream_t*>(&wrap->handle_),backlog,OnConnection)中的OnConnection。

> 小结：
> 收到客户端请求后，创建一个客户端socket，然后调用stream.connection_cb。
> stream.connection_cb就是OnConnection

> 注：stream->connection_cb的stream和tcp->connection_cb的tcp是一个东西。

### 2.2.4 OnConnection
OnConnection是/src/connection_wrap.cc下的一个函数，代码如下：

```c++
// 代码位置：/src/connection_wrap.cc
void ConnectionWrap<WrapType, UVType>::OnConnection(uv_stream_t* handle,int status) {
  ...
  Local<Value> client_handle;
  if (status == 0) {
    ...
    uv_stream_t* client = reinterpret_cast<uv_stream_t*>(&wrap->handle_);
    // 注意这里是uv_accept，和之前的uv__accept不同。
    if (uv_accept(handle, client))
      return;

    client_handle = client_obj;
  } else {
    client_handle = Undefined(env->isolate());
  }

  Local<Value> argv[] = { Integer::New(env->isolate(), status), client_handle };
  wrap_data->MakeCallback(env->onconnection_string(), arraysize(argv), argv);
}
```
这里的代码比较晦涩难懂，不过我们来简要概括一下：
* uv_accept(handle, client)： 给新建的client对象设置fd。只有关联了fd，才能算是一个完整的uv_stream_t,才能交给libuv管理。
  > 在2.2.2节中，我们提到新创建的客户端socket的fd临时保存在了（stream->accepted_fd = err，err就是新的socket的fd, stream就是这里的handle。）（变量命名的跳跃性，是读者面临的困扰之一）
* wrap_data->MakeCallback(env->onconnection_string(), arraysize(argv), argv)：
  把client封装，作为参数，调用net.js中的onconnection方法

那么用户可能会问：
1. 为什么uv_accept之后，不直接调用libuv的uv__io_start，把新建的client交给libuv呢？再通过js来做，不是多绕了一大圈吗？
2. 为什么说MakeCallback(env->onconnection_string()），就是调用net.js中的onconnection函数呢？

带着这两个问题，我们来继续分析。

### 2.2.5 net.js中的onconnection

在第一章2.2.1小节中，分析启动服务时，有解读过以下代码：
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
这里有一行代码“this._handle.onconnection = onconnection;”

即把net.js中的onconnection函数，赋给了this._handle；这里的this._handle就是我们的服务器实例。


```js
function onconnection(err, clientHandle) {
  const handle = this;
  const self = handle[owner_symbol];

  debug('onconnection');

  if (err) {
    self.emit('error', errnoException(err, 'accept'));
    return;
  }

  if (self.maxConnections && self._connections >= self.maxConnections) {
    clientHandle.close();
    return;
  }

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
  self.emit('connection', socket);
}
```
# 四.总结：

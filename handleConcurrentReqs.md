解读点：nodejs服务如何处理并发请求。

[TOC]

# 一.故事
这一天，10010店铺同时来了两位客人，王大妈和李大妈。

俩人前后脚进了店铺，都往门口的“红色篮子”里面写了字条（王大妈的字条在前，李大妈的字条在后）。

![alt 王大妈和李大妈写字条到红色篮子](./img/twoPerson.png)

机器人马上过来，从篮子里取出两个字条。

机器人先给王大妈分配了一个“蓝色篮子”，在上面写了一个数字“5”；然后在篮子上方放了一个探测器。

接着机器人又给李大妈分配了一个“蓝色篮子”，在上面写了一个数字“6”；然后也在篮子上方放了一个探测器。

做完这些，机器人就走了。

![alt 王大妈和李大妈的篮子分配完毕，王大妈的篮子在队列前](./img/allocTwoBaskets.png)

王大妈今天要采购的东西包括：
* 1斤芝麻
* 2斤土豆
* 3斤西红柿

于是王大妈写了3个字条：

* “芝麻，1斤”
* “土豆，2斤”， 
* “西红柿，3个；附带要求：颜色透红，不能酸，...”。

前两个字条比较简单，王大妈写好就放到5号篮子里面了。

但是第三个字条，王大妈附带了很多要求，大概要写几千字（夸张一点）。所以这第三个字条非常长，虽然已经放到了篮子里，但是王大妈还在写。

李大妈今天要采购的东西包括：
* 1瓶矿泉水
* 2斤马铃薯

李大妈写了2个字条“矿泉水，1瓶”，“马铃薯，2斤”，放到6号篮子里。

![img 王大妈李大妈放字条](./img/twoPersonPutNote.png)

> 请注意，由于王大妈在同一时间只能写一张字条，因此，她的三个购物需求字条，是有顺序的；同样李大妈的字条也是。

此时机器人过来了。

它先从5号篮子里面取出王大妈的第一个字条，放到面前的长条桌子上；但是此时他并没有真正处理王大妈的需求，而是去6号篮子里取出李大妈的第一个字条，也放到桌子上（同样也不会处理李大妈的字条），如下图所示。

![img 机器人分别取一个字条](./img/twoPersonRobotTakeNote.png)

机器人发现没有新用户了（只有王大妈和李大妈），因此机器人开始顺序处理台面上“王大妈的字条”和“李大妈的字条”。

这一轮处理完成后，状态如下图所示：

![img 机器人分别处理字条](./img/twoPersonRobotProcessNoteOver.png)

接着，再分别取一个字条：

![img 机器人分别取第二轮字条](./img/twoPersonRobotTakeSecondNote.png)

再处理一轮后，如下：

![img 机器人处理第二轮](./img/twoPersonRobotProcessSecondNoteOver.png)

> 上图中，那张长长的字条就代表王大妈一直在写的“西红柿”采购要求。

然后再分别取一个字条：（注意李大妈篮子里没有了，所以只取到一张字条）
![img 机器人分别取第三轮字条](./img/twoPersonRobotTakeThirdNote.png)

机器人开始又一轮处理。但是此时由于王大妈还没有写完，因此这一轮处理并不能完成。

于是机器人循环下去，一直处理王大妈的“长字条”。

李大妈突然接到老伴电话，还要再采购
* 3包盐
* 4根火腿肠
* 5两茶叶

于是李大妈又往6号篮子里写了三个字条“盐，3包”，“火腿肠，4根”，“茶叶，5两”。

![img 李大妈放新的字条](./img/twoPersonLiPutNewNotes.png)


此时机器人还是照常遍历每个篮子。发现5号篮子的长字条依然在写，同时发现6号篮子里面有新需求了，于是把6号篮子里的新字条取出，放到了长桌上。

![img 机器人取李大妈新的字条](./img/twoPersonRobotTakeLiNewNote.png)

李大妈的三个新需求，都是简单的需求，机器人经过三轮便会处理完毕。

![img 机器人取李大妈新的字条](./img/twoPersonRobotProcessLiNewNotesOver.png)

此时李大妈拿到了所有的东西，离开商店。

王大妈还在写“西红柿”的采购要求。终于，王大妈写完了，机器人拿到了全部纸条内容，从后面货架上取到了符合要求的西红柿，放到5号篮子里。

![img 处理完所有请求](./img/twoPersonRobotProcessAllOver.png)
王大妈拿到了所有的东西，离开商店。


# 二.分析和对照
从上面的故事场景中看到，10010店铺可以同时服务多个客户。这跟nodejs服务可以处理并发请求是一样的。

但是由于店铺中只有一个机器人，所以多个客户的交易，还是按照顺序来完成的。nodejs也是一样，虽然可以处理高并发的海量请求，但是实际上还是按照次序一个一个串行处理完成的。

按照故事中的场景，我们来设计一下真实nodejs服务器下，两个用户并发请求的情况：
* 有个用户A,并行发送3个请求到服务器；
* 另外一个用户B,并行发送5个请求到服务器。
* 该服务器处理每个请求的时间需要20ms（假设）。
* 其中用户A的第三个请求，body数据较大（对照故事中王大妈对于西红柿的采购要求）。

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
* 3个西红柿 --> 用户A发送的超大包请求。
* 4根火腿肠 --> 用户B发送的第4个请求
* 机器人   --> nodejs主线程
# 三. nodejs源码解读
## 1. 解读入口
先来看普通用户启动的服务实例。

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

在上一章我们分析过，有请求到来时，最终会经过一系列链路，触发“启动服务时业务写的回调函数”，即上面net.createServer的参数函数。

此时，你的脑海里肯定冒出这样一个疑问，两个用户，8个请求，而且还包含一个超大包的请求，nodejs怎么区分两个用户，并对8个请求分别处理，并返回结果呢？

## 2.源码解读

### 2.1 如何区分两个用户？
在服务启动时，会创建一个对应的libuv服务实例（对应故事中的红色篮子），由libuv监听起来（即在一个无限循环中不断调用uv__io_poll）。

在故事场景中，机器人分别分配了“5号篮子”和“6号篮子”，用来区分王大妈和李大妈。同样，nodejs也会分配两个客户端实例，用来区分用户A和用户B的请求数据。

这个任务就是由uv__io_poll这个函数来做的。我们省略无关代码，从另一个角度解读。（请注意看注释）
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
上一章已经分析，这里的w->cb就是uv__server_io,为每个新用户创建一个libuv客户端实例。

> 内核操作系统，会为这两个客户端实例创建两个socket。

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
> 其实准确来说，这里的“c”是net.js中的Socket实例，是对libuv客户端实例的再一次封装。
> 
> 为了简化，我们可以粗略认定这里的c就是libuv客户端实例。
> 
>libuv客户端实例是如何作为参数c传进来的，请参考上一章的解读

不同的用户，对应不同的“c”;不同的“c”设置各自的监听事件，各自处理自己的数据，互不影响。

也就是说，服务器给每个用户分配了libuv客户端实例，以达到区分的目的。

### 2.2 如何区分8个请求？

这8个请求，有3个是用户A的，有5个是用户B的。怎么区分每一个请求呢？ 

答案是： 我们必须在各自的回调函数中来处理这一切【即c.on('data', callback)】。

伪代码如下：

```js
    const reqData = [];
    // c代表一个用户。
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


基于此，nodejs封装了一个native模块http.js。这个模块通过http-parser(node12以后改为llhttp),来解析用户的请求。
http-parser(或者llhttp)实际上是一个有限状态机，不断读取字符，以实现解析请求数据。
很多的nodejs框架以及连带的库（比如koajs + koa-bodyparser），也是基于此做了进一步封装，业务开发其实并不用真正关心。

接下来，我们来看下，http解析器是如何运作的。

> 注：由于我们是解读的nodejs14版本，因此，这里的解析器特指llhttp.

// todo 完全按照故事中的场景解读
##### 2.2.3.1 http.js如何创建服务
首先来看一个使用http.js模块启动的样例：

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

首先看入口代码http.createServer：
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

##### 2.2.3.2 新用户接受后，触发哪个回调？
在上一章中的“2.4 OnConnection”小节中，我们知道，一个新tcp连接建立后，服务调用了net.js中的onconnection函数。
```js
// 文件位置：/lib/net.js
function onconnection(err, clientHandle) {
  ...
  self.emit('connection', socket);
}
```
这里触发了connection事件。

那么必定有个地方已经注册了connection事件。

我们回忆一下，通过net.createServer创建的服务实例，我们注意到，在net.js中的Server构造函数中，有注册一个connection事件，代码如下：
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

真相就在这里了。http.createServer创建的服务实例，自己注册了一个connection事件。回调则是_http_server.js中的connectionListener函数。

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
  const parser = parsers.alloc();// 分配一个解析器
  parser.socket = socket;
  socket.parser = parser;
  ...

  if (socket._handle && socket._handle.isStreamBase &&
      !socket._handle._consumed) {
    parser._consumed = true;
    socket._handle._consumed = true;
    parser.consume(socket._handle);// 设置请求流的消费方式
  }
  
}
```

从上面代码看到，当一个新用户了以后，回调函数做了两件事情：

* 分配一个parser（即llhttp解析器）
* 设置请求流的消费方式：parser.consume(socket._handle);

首先是分配解析器。nodejs服务启动时，会先设置1000个大小的解析器池子，当用到的时候就从中取一个。（这部分内容本章节暂不展开，用户只需要知道就行）。

其次是设置消费方式。我们看下parser.consume做了啥。

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
      // 此时便可以调用read_cb，通知上层，并把数据传过去
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
```
可以看到，这里就是把读取到的buf数据，继续往上传（即扩散出去，EmitRead）。

```c++
// 文件地址：/src/stream_base-inl.h
void StreamResource::EmitRead(ssize_t nread, const uv_buf_t& buf) {
  DebugSealHandleScope handle_scope(v8::Isolate::GetCurrent());
  if (nread > 0)
    bytes_read_ += static_cast<uint64_t>(nread);
  listener_->OnStreamRead(nread, buf);
}
```

上一节中，我们留了一个问题还没解答，即：tcp连接建立时，把解析器parser赋给/src/stream_base-inl.h中的listener_，为什么要这么做？

到这里，答案便很清楚了，是为了请求数据到来时，可以拿到这个parser(即listener_)，进行原始数据解析。

这里的listener_->OnStreamRead(nread, buf),将会触发node_http_parser.cc中的OnStreamRead。（注意，不是/src/stream_base.cc中的OnStreamRead）

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

> 小结：服务端收到用户请求后，调用uv__read从stream流上读取数据，传给解析器进行解析。

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
> 1.当接收到一个新的req请求时，首先先读取64k大小的数据，传给llhttp解析。
> 2.llhttp解析完头部后，触发parserOnHeadersComplete，然后调用parserOnIncoming。
> 3.parserOnIncoming则触发一个“request”事件，接着调用业务代码中回调函数（即http.createServer入参函数）。

###### requestListener 的处理过程
1.回调函数requestListener是业务自己写的，如果仅仅处理get请求，那么直接这样写就行：
```js
// 处理get类型请求的requestListener写法
const http = require('http');
const server = http.createServer((req, res) => {
  console.log('new request');
  // 客户端的参数是在头部中的，可以直接在req上取到。
  // 此时可以直接设置内容，并返回给客户端
  res.end('Hello World');
});
server.listen(3000);
```

2.如果是post请求，那么怎么获取到客户端请求的body数据呢？（body数据在req上是拿不到的）

为什么req上拿不到数据呢？因为客户端body数据有大有小，因此必须用stream（流）的方式来获取。

下面我们直接展示方法：
```js
// 处理带有body的 requestListener 写法
const http = require('http');
const server = http.createServer((req, res) => {
  console.log('new request');
  // req是个流，通过注册data事件获取数据
  req.on('data', (data) => {
    console.log('data received');
    res.end('Hello World');
  })
});
server.listen(3000);
```

很清晰易懂吧，通过监听req这个流，来获取数据。

可是仔细想想，这背后的过程是怎么样的呢？如果是一个超大的body，可能需要分多次传输。这些数据是怎么流转的呢？

下面我们来详细解析一下。

###### 某个req的body数据的流转过程。
在上面的requestListener中，参数req，是/lib/_http_incoming.js中的IncomingMessage实例，并不是客户端实例（socket实例）。

由于req是一个readable stream实例，因此它的on方法是有特殊含义的。在req下注册了一个data事件，会发生什么呢？

我们来看下
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

这个this.resume()会在下一个tick中，调用flow方法。

flow方法的关键在于一个无限循环，不断调用read方法来读取数据。

```js
// 文件地址：lib/_stream_readable.js
function flow(stream) {
  const state = stream._readableState;
  debug('flow', state.flowing);
  while (state.flowing && stream.read() !== null);
}
```

stream.read方法，很重要，它的代码如下：

```js
// 文件地址：lib/_stream_readable.js
Readable.prototype.read = function(n) {
  ...
  // 从stream的state的buffer中读取有多少字节数
  n = howMuchToRead(n, state);
  ...
  if (state.ended || state.reading || state.destroyed || state.errored) {
    ...
  } else if (doRead) {
    // 设置状态：state.reading = true 表示从底层资源获取数据；
    // 获取完以后，会自动state.reading = false;(addChunk中可以看到)
    state.reading = true;
    ...
    // 开始从底部资源读取数据，注意这个_read方法是不同业务场景提供的（比如req是_http_incoming.js提供的，fs读取流是/lib/internal/fs/stream.js提供的）
    // 注意：这个方法可能是同步的，也可能是异步的。
    // req中提供的_read什么也没做。
    this._read(state.highWaterMark);
    state.sync = false;
    // If _read pushed data synchronously, then `reading` will be false,
    // and we need to re-evaluate how much data we can return to the user.
    if (!state.reading)
      n = howMuchToRead(nOrig, state);
  }

  let ret;
  if (n > 0)
    ret = fromList(n, state);
  else
    ret = null;

  if (ret === null) {
    state.needReadable = state.length <= state.highWaterMark;
    n = 0;
  } else {
    state.length -= n;
    if (state.multiAwaitDrain) {
      state.awaitDrainWriters.clear();
    } else {
      state.awaitDrainWriters = null;
    }
  }

  if (state.length === 0) {
    // If we have nothing in the buffer, then we want to know
    // as soon as we *do* get something into the buffer.
    if (!state.ended)
      state.needReadable = true;

    // If we tried to read() past the EOF, then emit end on the next tick.
    if (nOrig !== n && state.ended)
      endReadable(this);
  }

  if (ret !== null)
    this.emit('data', ret);

  return ret;
};
```
触发stream.push(),最终触发“data”事件。(emit('data'))。

我们知道，uv__read一次读取了64k大小的数据；所以如果请求中有body数据，那么这第一次读取，不仅读取了头部，还会读取部分或者全部的body数据。

因此，我们这里就立刻尝试通过this.resume()触发一次“data”事件。

> 对应于故事中，王大妈的第一个纸条，信息量比较小，机器人一次就能读取完毕，知道王大妈需要采购“芝麻，1斤”。

![img 图片](./img/bodyFirstRead.png)

> 注：对应故事场景中，“机器人取字条到桌子上”这个动作，等同于nodejs中的uv__read动作，即从stream上读取一块64K大小的数据到buf中。
###### requestListener的处理第二次及后续读取

如果body数据过大，那么第一次读取只能读取一部分。接下来，会进行第二次，第三次读取（同样也是一次读取64k），直到把数据全部读取完毕。

> 对应于故事中，王大妈的第三个请求，对西红柿的采购要求特别高，王大妈写了个非常长的字条，机器人一次读取不完。

那么第二次，第三次等读取到64k，怎么触发“data”事件呢？

我们来做一个实验，发送一个body大小为2Mb的请求。同时打断点，看下第二次读取数据后，解析器解析完成后，做了啥。

![img 图片](./img/callOnBody.png)

可以看到，llhttp调用了node_http_parser.cc中的on_body函数。

on_body函数的代码如下：

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
> 1.对于大body类型的请求，第一次读取64k数据，其中的body部分，会通过this.resume()，调用flow方法，触发stream.push(),最终触发“data”事件。(emit('data'))；
> 
> 2.后续第二次，第三次，会通过node_http_parser.cc中的on_body来调用stream.push(slice)，最终触发“data”事件。

到此，我们就知道了，对于一个用户内的不同请求，是通过llhttp解析器来区分不同的请求的。

# 四.总结：

nodejs服务只有一个主线程在处理逻辑;但是通过libuv loop循环，精确区分每一个用户；同时通过http解析器区分同一个用户下的不同请求。最终实现处理并发请求的能力。

最后，我们把故事中的场景，放到nodejs的源码程序中，得到一张处理序列图，希望能够把nodejs抽象复杂的处理逻辑，变得直观一些。
![img 处理请求的调用次序图](./img/callSequence.png)

另外一张是stream flow的过程图
![img streamflow图](./img/stream_flow.png)
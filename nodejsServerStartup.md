解读点：nodejs服务如何启动。
# 一.故事
“10010百货店”要开张营业了，由于所在的市经贸大厦有规定，店铺外面不能张贴任何标识。

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

## 2. 源码解读
从上面的入口代码看出，一个普通的nodejs服务，实际上是由net模块来实现的。

那么net模块是什么呢？它属于哪个角色呢？

nodejs源码是由C++和js两部分语言文件组成。其中的模块被划分为两类模块：

* 内建模块
  * 由c++编写的。核心的处理逻辑，都是c++语言开发的，这些模块官方称为build-in模块；
  * 代码放置在/src目录下。
  * 举例：node.cc, node_file.cc, node_buffer.cc等
* 原生模块
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

### 2.2 启动解读
我们再来回顾一下故事中的情节，看下一个普通的服务启动要经过的过程：
* 绑定一个ip:port地址，即bind();
* 监听，即listen();

net.js模块也就是干了这些事情；只不过它把所有这些过程都放在了net.js的listen方法中。
那么我们就来分析一下listen。


# 本书目的
通过讲故事的方式，带领大家一步一步解读nodejs源码，深入了解nodejs的设计思想和运行原理。

# 本书的讲解方式

通过将大家较为熟悉的日常生活流程，来模拟nodejs服务的运作流程。

经过几番思索，决定通过“百货店”来模拟nodejs服务器。

>百货店，是售卖日常消费品的商店；人们"进店-->买到东西-->走出商店"的过程，非常类似于一个网络请求的全部过程。

举例如下：

1. 顾客到店铺，模仿用户请求到达
![alt 隔离带+告示牌+红色篮子](./img/putNote.png)

2. 店铺机器人准备好货物，模仿服务器处理请求并返回数据：
![alt 机器人把东西放进蓝色篮子](./img/robotFetchGood.png)

# 章节设置

全书按照以下章节来讲解。用户可以根据自己的需要选择某个章节查看。建议从头开始。

### [1.百货店和nodejs](./1.storeAndNodejs.md)

### [2.nodejs服务启动流程](./2.nodejsServerStartup.md)

### [3.nodejs如何处理用户的请求](./3.handleRequest.md)

### [4.nodejs如何处理高并发请求](./4.handleConcurrentReqs.md)

### [5.nodejs如何发出请求](./5.clientRequest.md)

### [6.nodejs如何处理文件](./6.fs.md)

### [7.nodejs 流操作](./7.stream.md)

### [8.nodejs timer](./8.timer.md)
### [9.进程](./9.process.md)
### 10.实战应用

> 另外一个开源仓库：[coderweek](https://github.com/coderweek/coderweek.github.io),里面是纯技术探索
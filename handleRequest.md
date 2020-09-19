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

刚放到“红色篮子”里，立马就从里面走过来一个机器人，把“红色篮子”里的字条拿起来。
![alt 红色篮子字条放大+机器人过来]
同时机器人从旁边取了一个“蓝色篮子”，在上面写了一个数字“1”（王大妈是第一位顾客)，然后把“蓝色篮子”放一边，就走了。

![alt 机器人取分配蓝色篮子]()

这时候，王大妈看到旁边还有个告示牌，说：
> 请分配到“蓝色篮子”的顾客，把你们的需求写在纸条上，放进属于自己的“蓝色篮子”里。
> 机器人会自动处理的。

于是王大妈又写了一张纸条，上面写着：“黄豆，2斤”，放到了分配给自己的篮子里。
![alt 王大妈写字条到蓝色篮子]()
刚放进去，机器人立马过来了，拿起字条，转身走到后面。
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
uv__io_poll封装了个个平台的差异性（linux下使用epoll， mac下使用kqueue, windows下是iocp）。我们以linux的epoll为例来解读。

```c++
// 文件地址：/deps/uv/src/unix/linux-core.c
void uv__io_poll(uv_loop_t* loop, int timeout) {
  // 1.设置一堆必要的变量
  ...
  // 2.从loop下的watcher_queue依次取出一个观察对象（在上一章节nodejs服务启动时，曾经创建了一个服务实例，并挂载到了loop->watcher_queue下）
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
      // 5.调用epoll_wait，获取epoll中有请求到来的服务实例（这里会阻塞）
      nfds = epoll_wait(loop->backend_fd,
                        events,
                        ARRAY_SIZE(events),
                        timeout);
    ...
    // 6.拿到
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
下面是简要步骤：
* uv__io_poll会从loop->watcher_queue中取出一个（上面我们有分析，node服务启动后，会把服务注册到这个队列中，参见“net模块中listen第三步：最后调用libuv的listen”）。

* 取出后，调用epoll的epoll_ctl方法，表示我对这个服务的句柄感兴趣，告诉epoll：你帮我盯着。

* 然后调用epoll的epoll_pwait方法（这里会阻塞一会），拿到已经准备就绪的事件。

* 最后调用每个服务的回调： w->cb(loop, w, pe->events)  （这里的w就是第一步中从watcher_queue中取出来的东西）


# 四.总结：

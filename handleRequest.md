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

同时机器人从旁边取了一个“蓝色篮子”，在上面写了一个数字“12”，然后把“蓝色篮子”放一边，就走了。

![alt 机器人取名字字条+分配蓝色篮子]()

这时候，王大妈看到旁边还有个告示牌，说：
> 请分配到“蓝色篮子”的顾客，把你们的需求写在纸条上，放进属于自己的“蓝色篮子”里。
> 机器人会自动处理的。

于是王大妈又写了一张纸条，上面写着：“黄豆，2斤”，放到了分配给自己的篮子里。

刚放进去，机器人立马过来了，拿起字条，转身走到后面。

过了一会，机器人回来了，它把2斤黄豆放到了贴有“12”的“蓝色塑料篮子”里。

王大妈拿到了黄豆，从店铺里走出来。

# 二.分析和对照
店铺中，机器人负责查看是否有新的客人来，而店长则专注处理客人的需求。分工有序，紧密协作，才能保证有序高效运营。
## 1.原理分析
nodejs服务器也是一样，当进程启动后，不同的模块负责各自的东西。

比如说libuv负责查看请求是否到来，如果有请求到来，则创建一个socket对象代表客户端请求
## 2.关联
在这个故事情节中，王大妈相当于一次客户端请求，她的需求“黄豆，2斤”,相当于请求的参数；

* 王大妈    -->  http request
* 黄豆，2斤 --> body：{material: "黄豆", number: "2斤"}

# 三. nodejs源码解读
## 1. 解读入口
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

## 2. 源码解读


# 四.总结：

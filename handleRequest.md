解读点：nodejs服务如何处理客户端请求。

# 一.故事
现在10010店铺正式开业了。


# 二.分析和对照


## 1.原理分析


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

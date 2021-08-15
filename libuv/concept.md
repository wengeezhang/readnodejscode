# libuv核心概念

* 每个线程，有一个唯一的loop uv_loop_t
* 基于基类 uv_handle_t，创建各类handle，并把这些handle挂载到uv_loop_t下。

# libuv启动流程
* 首先初始化一个loop
```c++
uv_loop_t *loop = malloc(sizeof(uv_loop_t));
uv_loop_init(loop);
```

* 然后初始化你想要的hanble。样板为：uv_TYPE_init(uv_loop_t *, uv_TYPE_t *)。
    * 初始化后，调用开始，并传入一个callback函数。
    * 可以看到，这里callback可以主动结束自己，这样uv_run会检测到没有active的handle，结束uv_run
```c++
void wait_for_a_while(uv_idle_t* handle) {
    counter++;

    if (counter >= 10e6)
        uv_idle_stop(handle);
}

uv_idle_t idler;

uv_idle_init(uv_default_loop(), &idler);
uv_idle_start(&idler, wait_for_a_while);
```

* 开始执行uv_run
```c++
printf("Idling...\n");
uv_run(uv_default_loop(), UV_RUN_DEFAULT);

uv_loop_close(uv_default_loop());
return 0;
```
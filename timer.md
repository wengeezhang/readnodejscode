解读点：timer的运行原理。

[TOC]

# 一.故事
接待顾客，是10010店铺最主要的功能；从外人看来，这就是店铺的全部。

然而一个店铺要正常运转，它内部还会有很复杂的流程，比如进货，货物加工处理，摆放货物，客户交易后的后续处理等等。

举个简单的例子：
有个特殊顾客来买便当，要求加热；10010店铺的机器人会把便当放进微波炉加热3分钟。等3分钟一到，机器人才能把便当交给顾客。

# 二.分析和对照

常见的timer有：
* setTimeout
* setImmediate
* setInterval
## 1.原理分析
## 2.关联

# 三. nodejs源码解读
## 1. 解读入口
先看一段常见的业务代码：
```js
// 业务代码：
setTimeout(() => {
    console.log('do something after 3 mins');
}, 60 * 1000 * 3)
```

很简单，就是在3分钟后，执行一段逻辑。类似于故事场景中，微波炉设置3分钟。
## 2. 源码解读

setTimeout是全局函数，我们来看看它的定义：

```js
// 文件位置：/lib/timers.js
function setTimeout(callback, after, arg1, arg2, arg3) {
  ... // 参数准备相关工作，这里不展开
  const timeout = new Timeout(callback, after, args, false, true);
  insert(timeout, timeout._idleTimeout);
  return timeout;
}
```

可以看到，setTimeout做了两件事：
* 就是创建一个timer实例timeout
* 然后将timeout插入到链表中。

先看第一部分。
### 2.1 创建一个timer实例
新创建的timer实例，其实是一个Timeout对象。我们来看下这个构建函数的代码：
```js
// 文件位置： /lib/internal/timers.js
function Timeout(callback, after, args, isRepeat, isRefed) {
  ...

  this._idleTimeout = after;
  this._idlePrev = this;
  this._idleNext = this;
  this._idleStart = null;
  // This must be set to null first to avoid function tracking
  // on the hidden class, revisit in V8 versions after 6.2
  this._onTimeout = null;
  this._onTimeout = callback;
  this._timerArgs = args;
  this._repeat = isRepeat ? after : null;
  this._destroyed = false;

  ...
}
```
很简单，就是设置几个属性。

从属性上看（_idleNext，_idleNext），很明显，这个对象肯定是要插入链表的。

> 这里先剧透一下整体工作原理：
> nodejs会维持一个链表，每次调用setTimeout都会创建的实例，并插入到这个链表中。
> 然后libuv会轮询这个链表，并在合适的时候触发链表中每个实例对应的回调。


那么这个链表是在哪创建的呢？又是怎么插入的？下面一节我们来展开。

### 2.2 创建链表，将timer实例放进去
上一节中，创建完timer实例后，调用了以下代码：“insert(timeout, timeout._idleTimeout)”。

也就是在insert这里，同时完成了“创建链表”，“把timer对象放进链表”这两个任务。

下面我们来看代码。

```js
// 文件位置：/lib/internal/timers.js
function insert(item, msecs, start = getLibuvNow()) {
  ...
  let list = timerListMap[msecs];
  if (list === undefined) {
    ...
    const expiry = start + msecs;
    // 1. 创建一个链表 list，并放到map中备用
    timerListMap[msecs] = list = new TimersList(expiry, msecs);
    // 2. 同时把链表插入到专用队列timerListQueue中
    timerListQueue.insert(list);

    if (nextExpiry > expiry) {
      // 3. 给libuv传递一个信号，表示用户设置了一个“msecs”的timer（注意这里只有时间信息，其他libuv不需要关注）
      scheduleTimer(msecs);
      nextExpiry = expiry;
    }
  }
  // 4. 将timer实例，插入到新建的链表list中
  L.append(list, item);
}
```
insert主要做了4件事：
* 创建一个链表：list = new TimersList(expiry, msecs)
* 将链表list存放到专用队列：timerListQueue.insert(list);
* 给libuv传递一个信号，表示有一个“msecs”的timer实例：scheduleTimer(msecs);
* 将timer实例插入到新建的链表list中。

接下来我们来一一分解这四件事。
#### 2.2.1 创建链表

nodejs会用链表来存储创建的timer实例。但是有一点需要注意，nodejs不是只维护一个链表，而是根据timer的时间，维护多个链表。

举例来讲，setTimeout(fn1, 1000) 和setTimeout(fn2, 2000)两个timer实例，是在两个链表中维护的。

业务开发中，可能会创建很多不通时间的timer实例，nodejs对应的就会维护多个链表。所有的链表通过一个map对象维护起来，就是timerListMap。

timerListMap的key就是延迟时间，值就是链表。

```js
// timerListMap结构：
{
  "1000": list1,
  "2000": list2,
  ...
  "3001": listn
}
```

所以insert函数第一步要做的事情，就是去timerListMap中查询是否已经有对应的链表存在；如果存在，那么取出这个存在的链表；如果不存在，则新建一个链表。

新建链表是通过“list = new TimersList(expiry, msecs);”这个语句实现的。可以看出，新链表就是TimerList实例。

TimerList是个典型的双向链表，有以下特征：

* 链表中的节点首尾相连
* 链表中有个“特殊节点”，代表这个链表自身（其实它和其他节点没什么区别，就是多存储了一些链表的信息，如链表id,过期时间等）
* 节点都有两个属性，一个是_idlePrev，指向它的上一个节点；一个是_idleNext，指向它的下一个节点。

![双向链表图解](./img/linkedlist.png)

> 还有一种解读视角，是将节点想象为表盘上的点:顺时针向下表示next;逆时针向上表示pre;其中12点或者0点，表示链表的根节点。

链表创建完成后，额外地将链表存放到映射对象timerListMap中，方便后续读取整个链表。

双向链表一般都会具备以下功能：
* 追加一个新节点（在链表末尾）：append
* 删除一个节点: remove
* 获取链表的头部节点（一般是最先插入的）: peek

读到这里，js开发者会理所当然地认为，这些功能，应该是实例list下的方法，需要用的时候，直接调用即可。

比如追加一个节点，就是：list.append(node1)。

然而现实并不是这样。nodejs另外有一个专属工具来辅助完成。

这个专属工具就是L：
```js
// 文件位置：/lib/internal/timers.js
const L = require('internal/linkedlist');
```

翻看L的源码，发现它没有任何业务含义，只是纯粹的工具函数，拥有四个方法，没有任何状态。
* init,
* peek,
* remove,
* append,
* isEmpty

通过这个工具函数，我们便可以操作新建的链表，比如：
* 追加一个节点：L.append(list, node1)
* 删除一个节点：L.remove(node2)
* 获取链表头部节点：L.peek(list);


#### 2.2.2 将链表list存放到专用队列

链表是管理timer节点的。然而链表也会有多个，怎么管理链表呢？

>因为可能会创建很多timer，并且每个的过期时间不同，所有nodejs会有很多的链表。
>每个链表存放相同过期时间的timer。


答案是：nodejs额外维护了一个专用队列，这个队列是一个“优先队列”，新创建完链表都会插入到这个优先队列中进行管理。

然后nodejs会检测这个优先队列，找到最先过期的链表。如何快速找到最先过期的链表，是这个优先队列要解决的问题。

实现方式有很多，不过最常见的便是用最小二叉堆来实现这个优先队列。

##### 2.2.2.1 最小二叉堆表示优先队列

我们先看下二叉堆。

二叉堆本质是一棵二叉树，且最常见的是一棵完全二叉树。只不过它有一个额外的要求：父节点必须大于/小于子节点。

如果是父节点大于子节点，那么这个二叉堆便是最大二叉堆；
如果是父节点小于子节点，那么这个二叉堆便是最小二叉堆；

由于nodejs这里的“优先队列”维护的是过期时间这个概念，最先过期的要优先找到，因此最小二叉堆便是我们选择的方案。

> 优先队列，我们采用最小二叉堆这个方案。

选定了方案，再来看实现最小二叉堆具体的实现方式。

实现二叉堆有两种方式，一种是链表，一种是数组。由于数组的简洁性，因此大多数二叉堆都是采用数组来实现。

##### 2.2.2.2 采用数组实现最小二叉堆
先看算法设计：

二叉堆和数组之间存在一个奇妙的对应关系：
* 将二叉堆中的节点，按照“从上到下”，“从左到右”地，一一放到数组中去（一般数组中第一个元素空置，从下标1位置开始放）
* 数组中任何一个元素（假设index为n）,它的子元素是2n、2n+1;它的父元素是"n/2 | 0"(即Math.floor(n/2))。

再看实现：

由于我们是用数组来实现最小二叉堆，因此最开始我们初始化一个空数组arr。
* 最开始二叉堆是空的，新增一个节点，则往数组arr中push一个元素（从下标1开始）
* 当继续新增节点时，还是往数组中push元素，然后执行percolateup算法，进行排序。

我们来看下percolateup代码，非常简单：
```c++
// 文件位置：/lib/internal/priority_queue.js
percolateUp(pos) {
    const heap = this[kHeap];
    const compare = this[kCompare];
    const setPosition = this[kSetPosition];
    const item = heap[pos];

    while (pos > 1) {
      // 找到父元素
      const parent = heap[pos / 2 | 0];
      // 如果比父元素小，则不用再排了，直接结束
      if (compare(parent, item) <= 0)
        break;
      // 如果比父元素大，现将父元素转移下来
      heap[pos] = parent;
      if (setPosition !== undefined)
        setPosition(parent, pos);
      // 接着讲pos换成父元素的位置，继续比较
      pos = pos / 2 | 0;
    }
    // 比较完成后，确定新节点的位置后，便把它插入。
    heap[pos] = item;
    if (setPosition !== undefined)
      setPosition(item, pos);
  }
```
##### 2.2.2.3 将timer链表插入优先队列

我们来看一下nodejs中插入专用队列的代码：
```js
// 文件位置：/lib/internal/timers.js
// list是刚刚创建的链表；timerListQueue就是专用队列
timerListQueue.insert(list);
```

timerListQueue是就是我们要的优先队列，它其实是一个PriorityQueue实例。

```js
// 文件位置：/lib/internal/timers.js
const timerListQueue = new PriorityQueue(compareTimersLists, setPosition);
```

PriorityQueue的实例，即典型的二叉堆（binary heap）。

timerListQueue这个二叉堆的插入和排序如下：

```js
// 文件位置：/lib/internal/priority_queue.js
insert(value) {
    // 1. 插入新节点
    const heap = this[kHeap];
    const pos = ++this[kSize];
    heap[pos] = value;

    if (heap.length === pos)
      heap.length *= 2;
    // 2. 排序
    this.percolateUp(pos);
  }
```
> this.percolateUp参见上一小节的代码

#### 2.2.3 给libuv传递一个信号，表示有一个“msecs”的timer实例：scheduleTimer(msecs);

创建完了链表，并且将链表管理起来（插入优先队列）后，就可以发送一个信号给libuv，告诉它，业务这里有新建了timer，以便libuv能适当处理。

怎么告诉libuv呢？
我们来看代码
```js
// 文件位置：/lib/internal/timers.js
function insert(item, msecs, start = getLibuvNow()) {
  ...
  let list = timerListMap[msecs];
  if (list === undefined) {
    ...
    // 插入优先队列
    timerListQueue.insert(list);
    ...
    const expiry = start + msecs;
    ...
    // 如果新增的链表过期时间比上一次最小的过期时间还早，那么就通知livuv
    if (nextExpiry > expiry) {
      scheduleTimer(msecs);
      nextExpiry = expiry;
    }
  }
  ...
}
```
从代码中可以看出，如果新的链表的过期时间比最短的过期时间还早（比如上一次是12点5分, 而此次的过期时间是12点1分），那么就有必要告诉libuv，说最近的过期时间要调整一下啦。

我们来看下scheduleTimer函数：
```c++
// 文件位置：/src/timers.cc
void ScheduleTimer(const FunctionCallbackInfo<Value>& args) {
  auto env = Environment::GetCurrent(args);
  env->ScheduleTimer(args[0]->IntegerValue(env->context()).FromJust());
}

// 文件位置：/src/env.cc
void Environment::ScheduleTimer(int64_t duration_ms) {
  if (started_cleanup_) return;
  uv_timer_start(timer_handle(), RunTimers, duration_ms, 0);
}
```
可以看出，ScheduleTimer最终调用了libuv中的uv_timer_start。

uv_timer_start就比较纯粹了，它无法做了三件事：
* 设置到期时要执行的回调函数
  * handle->timer_cb = cb;
  * 这里的cb就是uv_timer_start(timer_handle(), RunTimers, duration_ms, 0)中的RunTimers。
* 往最小堆中插入新的节点
  * heap_insert(timer_heap(handle->loop),
              (struct heap_node*) &handle->heap_node,
              timer_less_than);
  * 注意这里的最小堆是libuv维持的，和nodejs中的优先队列最小堆不一样
* 将handle设置为激活状态：
  * uv__handle_start(handle);

```c++
// 文件位置：/deps/uv/src/timers.c
int uv_timer_start(uv_timer_t* handle,
                   uv_timer_cb cb,
                   uint64_t timeout,
                   uint64_t repeat) {
  uint64_t clamped_timeout;

  if (uv__is_closing(handle) || cb == NULL)
    return UV_EINVAL;

  if (uv__is_active(handle))
    uv_timer_stop(handle);

  clamped_timeout = handle->loop->time + timeout;
  if (clamped_timeout < timeout)
    clamped_timeout = (uint64_t) -1;

  handle->timer_cb = cb;
  handle->timeout = clamped_timeout;
  handle->repeat = repeat;
  /* start_id is the second index to be compared in timer_less_than() */
  handle->start_id = handle->loop->timer_counter++;

  heap_insert(timer_heap(handle->loop),
              (struct heap_node*) &handle->heap_node,
              timer_less_than);
  uv__handle_start(handle);

  return 0;
}
```


> 新建timer对象的流程小结：
> * 创建一个timer对象
> * 插入链表 (如果对应的链表不存在则新建链表)
> * 如果新建了链表，则将新链表放到优先队列中
> * 如果新建的timer对象比以前的更快过期，则调用scheduleTimer, 告知libuv。

且慢，细心的网友可能会发现一个小小的疑问：每次有新的更短的timer，都要调用scheduleTimer，scheduleTimer 再调用uv_timer_start往libuv最小堆里插入一个timer handle的节点（handle->heap_node，此处的handle为timer handle），而且是同一个节点。这肯定不对。

这和已知的“新版本的nodejs中，libuv最小堆里面只有一个timer handle的节点”冲突了。

> 新版本的nodejs中，libuv的最小堆中仅仅维护一个节点，即最快到期的节点。
>/lib/internal/timers.js中通过优先队列和链表，管理所有的各个过期时间的timer对象。

libuv中，一个timer handle对应有一个heap_node。由于我们每次调用scheduleTimer，都是取的同一个timer handle
> 说明：
>nodejs中只维护一个timer handle，每次调用，直接返回&timer_handle_。
>```js
> // 文件位置：/src/env.cc
>void Environment::ScheduleTimer(int64_t duration_ms) {
>  ...
>  uv_timer_start(timer_handle(), RunTimers, duration_ms, 0);
>}
> // 文件位置：/src/env-inl.h
>(inline uv_timer_t* Environment::timer_handle() {
>  return &timer_handle_;
>})

所以，在调用uv_timer_start时，应该会做一个检查。

仔细查看，我们发现uv_timer_start会检测uv__is_active(handle)，如果是已经激活的状态，那么会首先停止它。
```c++
// 文件位置：/deps/uv/src/timers.c
int uv_timer_start(uv_timer_t* handle,
                   uv_timer_cb cb,
                   uint64_t timeout,
                   uint64_t repeat) {
  uint64_t clamped_timeout;

  if (uv__is_closing(handle) || cb == NULL)
    return UV_EINVAL;

  if (uv__is_active(handle))
    uv_timer_stop(handle);
```
uv__is_active比较简单，直接判断handle的flag状态：
```c++
// 文件位置：/deps/uv/src/uv-common.h
#define uv__is_active(h)                                                      \
  (((h)->flags & UV_HANDLE_ACTIVE) != 0)

```
> 每个handle都会有flags，可能的取值为：
> UV_HANDLE_CLOSING                     = 0x00000001,
  UV_HANDLE_CLOSED                      = 0x00000002,
  UV_HANDLE_ACTIVE                      = 0x00000004,
  ...
>
>假如同时设置了两个timer:
>```js
>setTimeout(() => {}, 5000)
>setTimeout(() => {}, 1000)
>```
>
>第一个5秒的timer会将全局唯一的timer handle激活，但是此时由于还没到过期时间，立马来了一个新的更快到期的timer(1秒)，此时调用uv__is_active会返回true

此时uv__is_active返回true,因此libuv会调用uv_timer_stop(handle),来停止timer handle。其实停止timer handle主要是完成两件事：
* 将timer handle变为非激活状态；同时将程序loop的active handles减1
* 从libuv最小堆中将timer handle对于的节点删除

```c++
// 文件位置：/deps/uv/src/timer.c
int uv_timer_stop(uv_timer_t* handle) {
  if (!uv__is_active(handle))
    return 0;

  heap_remove(timer_heap(handle->loop),
              (struct heap_node*) &handle->heap_node,
              timer_less_than);
  uv__handle_stop(handle);

  return 0;
}
// 文件位置：/deps/uv/src/uv-common.h
#define uv__handle_stop(h)                                                    \
  do {                                                                        \
    if (((h)->flags & UV_HANDLE_ACTIVE) == 0) break;                          \
    (h)->flags &= ~UV_HANDLE_ACTIVE;                                          \
    if (((h)->flags & UV_HANDLE_REF) != 0) uv__active_handle_rm(h);           \
  }                                                                           \
  while (0)
```

删除完后，就可以重新再插入了。



到此为止，创建一个新的timer对象的准备工作就算全部完成了。接下来就交给libuv去决定什么时候触发回调了。

### 2.3 触发timer实例的回调

libuv是在uv__run_timers这个阶段来处理timer的。我们来看下它的代码：

```c++
// 文件位置：/deps/uv/src/timers.c
void uv__run_timers(uv_loop_t* loop) {
  struct heap_node* heap_node;
  uv_timer_t* handle;

  for (;;) {
    heap_node = heap_min(timer_heap(loop));
    if (heap_node == NULL)
      break;

    handle = container_of(heap_node, uv_timer_t, heap_node);
    if (handle->timeout > loop->time)
      break;

    uv_timer_stop(handle);
    uv_timer_again(handle);
    handle->timer_cb(handle);
  }
}
```

可以看到这里的逻辑很清晰，做了以下几件事：
* 从最小堆中取出最早过期的节点：
  * heap_node = heap_min(timer_heap(loop));
* 将该节点从最小堆中删除（如果是setInterval，再重新插入进去）
  * uv_timer_stop(handle);
  * uv_timer_again(handle);
* 执行节点上绑定的回调
  * handle->timer_cb(handle);
  * 这里的timer_cb就是2.2小节中的RunTimers

到这里，接力棒给到了RunTimers，我们来看下它的代码：

```c++
// 文件位置：/src/env.cc
void Environment::RunTimers(uv_timer_t* handle) {
  Environment* env = Environment::from_timer_handle(handle);
  TraceEventScope trace_scope(TRACING_CATEGORY_NODE1(environment),
                              "RunTimers", env);

  ...
  Local<Function> cb = env->timers_callback_function();
  ...
  do {
    ...
    ret = cb->Call(env->context(), process, 1, &arg);
  } while (ret.IsEmpty() && env->can_call_into_js());
  ...
  if (ret.IsEmpty())
    return;
  ...

  if (expiry_ms != 0) {
    env->ScheduleTimer(...);
    ...
  } else {
    uv_unref(h);
  }
}

```
RunTimers的主要功能：
* 执行env->timers_callback_function()
* 判断是否有剩余的链表，如果有，再次编排上env->ScheduleTimer

我们主要看下env->timers_callback_function。它是什么呢？

回想一下，在nodejs进程启动的时候，执行过node.js这个模块，在它里面执行过以下代码：
```js
// 文件位置：/lib/internal/bootstrap/node.js
{
  const { nextTick, runNextTicks } = setupTaskQueue();
  ...
  const { getTimerCallbacks } = require('internal/timers');
  const { setupTimers } = internalBinding('timers');
  const { processImmediate, processTimers } = getTimerCallbacks(runNextTicks);
  ...
  setupTimers(processImmediate, processTimers);
}
```

```c++
// 文件位置：/src/timers.cc
void SetupTimers(const FunctionCallbackInfo<Value>& args) {
  ...
  env->set_immediate_callback_function(args[0].As<Function>());
  env->set_timers_callback_function(args[1].As<Function>());
}
```
从上面代码中看到，processTimers是/lib/internal/timers.js中导出的一个函数；

而setupTimers，就是将processTimers设置为了timers_call_function。

也就是说，RunTimers中执行的函数，就是 processTimers。

那么我们来看看processTimers：
```js
// 文件位置：/lib/internal/timers.js
  function processTimers(now) {
    debug('process timer lists %d', now);
    nextExpiry = Infinity;

    let list;
    let ranAtLeastOneList = false;
    while (list = timerListQueue.peek()) {
      if (list.expiry > now) {
        nextExpiry = list.expiry;
        return refCount > 0 ? nextExpiry : -nextExpiry;
      }
      if (ranAtLeastOneList)
        runNextTicks();
      else
        ranAtLeastOneList = true;
      listOnTimeout(list, now);
    }
    return 0;
  }
```
processTimers非常简单，就是从之前讲过的优先队列中取出一个timer链表，判断是否过期：
* 如果没有过期(返回值为非0)，则直接返回这个将来的过期时间（供后面判断）
> processTimers是在RunTimers中被调用的，RunTimers执行完processTimers后，会判断其返回值，参见/src/env.cc中的注释：
> // To allow for less JS-C++ boundary crossing, the value returned from JS
  // serves a few purposes:
  // 1. If it's 0, no more timers exist and the handle should be unrefed
  // 2. If it's > 0, the value represents the next timer's expiry and there
  //    is at least one timer remaining that is refed.
  // 3. If it's < 0, the absolute value represents the next timer's expiry
  //    and there are no timers that are refed.

* 如果过期（返回值为0），则清理链表中的timers， 即调用listOnTimeout(list, now);
  * 注意这里会适时地清理tick queue上的人物（runNextTicks()）

那么最后，我们来看看，如果过期了，nodejs是如何清理timer链表的，即listOnTimeout：

```js
// 文件位置：/lib/internal/timers.js
function listOnTimeout(list, now) {
    const msecs = list.msecs;

    debug('timeout callback %d', msecs);

    let ranAtLeastOneTimer = false;
    let timer;
    // 取出最先插入的timer
    while (timer = L.peek(list)) {
      ...
      L.remove(timer);
      ...

      try {
        const args = timer._timerArgs;
        if (args === undefined)
          timer._onTimeout();
        else
          timer._onTimeout(...args);
      } finally {
        ...
      }
      ...
    }
    ...
  }
```

这里隐藏其他逻辑，只看核心逻辑，可以看出listOnTimeout的功能：
* 从链表中取出最先插入的timer：timer = L.peek(list)
* 执行这个timer的回调：timer._onTimeout();

到此为止，nodejs触发timer回调的流程便结束了。

# 四.总结：

timer的生命周期可以简单划分为以下三个阶段：

* 创建timer实例对象
* 塞入链表
* 在合适的时机清理链表

而这一切，是通过js世界中的【链表+最小堆】、c++世界中的【最小堆】配合起来，由libuv主导循环运作来实现的。
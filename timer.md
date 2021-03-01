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
### 2.1 创建一个timer实例
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

nodejs会用链表来存储创建的timer实例。但是有一点需要注意，nodejs不是只维护一个链表，而是根据timer的时间，维护不通的链表。
举例来讲，setTimeout(fn1, 1000) 和setTimeout(fn2, 2000)两个timer实例，是在两个不通的链表中维护的。

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





### 2.3 触发timer实例的回调

# 四.总结：

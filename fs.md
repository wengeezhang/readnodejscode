解读点：nodejs文件读取模块

[TOC]

# 一.故事
王大妈和李大妈又一起来10010店铺采购东西。这次两人都准备采购玉米，不同的是，两人采购的量不同：
* 李大妈只是做玉米糊，采购1斤就够了。
* 王大妈要做玉米面的馒头售卖，准备采购500斤。

因为采购的量太大，所以王大妈开了辆车过来。

来到店铺前，王大妈和李大妈将采购需求放到篮子里，机器人过来取。
![alt 王大妈和李大妈写字条到红色篮子](./img/lvdou.png)

> 机器人如何处理请求，以及红色篮子、蓝色篮子的概念理解，请移步第三章“3.nodejs如何处理用户的请求”

机器人怎么处理这两个顾客的需求呢？
## 方式1：机器人独自完成任务
机器人最简单粗暴的处理方式是：一次把东西取出来，交给王大妈和李大妈。

![alt 王大妈和李大妈写字条到红色篮子](./img/lvdou_sync.png)


对于李大妈的需求，机器人可以很快搞定。而王大妈的需求则比较棘手，需要消耗的时间略长。

### 方式1面临的问题
此时一个非常关键的问题出现了：
由于玉米这种货物不经常售卖，为了节省空间，10010店铺没有把玉米放在店铺中，而是放在了后面的仓库中。等有人需要，才去仓库中取出来。

仓库平时是锁着的，而且仓库的货架都很高，找到玉米并取下来也费时费力。

我们假设机器人完成这些动作需要消耗5分钟（甚至更长）；如果此时又来了新的顾客，那么新的顾客至少要等到5分钟。

也就是说，采用这种方式，店铺在处理顾客的数量能力上，将大大受到影响。

## 方式2：增添几个仓库机器人

如果我们增添几个仓库机器人，专门用来管理仓库、进货、取货，是不是效率更高呢？

> 为了区分，我们把店铺接待顾客的机器人称为“客户管理机器人”，管理仓库的机器人称为“仓库管理机器人”

我们设想一下店铺新的运行模式：

* “客户管理机器人”主要在门口接待顾客；如果客户的需求很简单容易，则它可以直接完成；
* 如果顾客的需求很麻烦，耗时很长，“客户管理机器人”便将需求转交给“仓库管理机器人”去协助完成

简要流程图：
![两类机器人](./img/twoRobotTypes.png)

真实场景图：
先看只有王大妈的情况：
![去仓库取货物实际流程](./img/fetchGoodFromBackHouseSimple.png)

再看王大妈和李大妈同事存在的情况:

![去仓库取或者直接返回](./img/fetchGoodFromBackHouseOrDirect.png)


>注意：实际上，无论李大妈的货物有多简单，只要是去仓库取，都应该交给机器人，不应该自己完成，即最正确的做法是：
>
>![去仓库取](./img/fetchGoodFromBackHouse.png)
>
> 对应于nodejs中，无论读取文件有多简单，除非万不得已，一般都要使用异步方法:即使用fs.read，不要使用fs.readSync

使用方式2，可以看到，在繁忙的时间段，“客户管理机器人”依然能够接待每一个客人。繁重的工作交给“仓库管理机器人”去协同完成。

似乎是完美了。

### 方式2面临的问题
然而问题又来了：
一次性取500斤玉米可不是个完美的方案。我们看看为什么。

500斤玉米，按照每袋100斤计算，共计5袋。“仓库管理机器人”需要把5袋一次性取完，才能交给“客户管理机器人”，然后再交给王大妈。

在取完5袋之前，王大妈一直空闲着，相当于是人力（资源）浪费；然后是突然一下子来了5袋，王大妈要花费很长时间一袋一袋往车子上装。

能不能换一种方式：
* 取一袋，交给王大妈，王大妈先装上车；
* 然后循环往复取下一袋
* 最后一袋取出来，王大妈直接装上车，就可以离开店铺。

答案时候可以的，我们看方式3。

## 方式3：流式取货物
在这种模式下，“仓库管理机器人”只要取到一部分玉米，就转交给“客户管理机器人”，再转交给客户。

![流式取货物](./img/streamDemo.png)

在这种模式下，即使客户王大妈要采购1吨，甚至100吨的玉米，整个10010店铺也不会停摆：“客户管理机器人”依然可以见缝插针地服务别的客户。



# 二.分析和对照

# 三. nodejs源码解读

fs模块提供的方法较多，但是核心的就是readFile和readFileSync。搞懂了这两个的运行原理和流程，其他的自然就知道了。

我们看下readFile（异步）的实现。

* 第一步：先初始化一个context，后续很多回调都会挂在这里。
* 第二步：初始化一个req:const req = new FSReqCallback();把回调callback挂在这里。
* 然后把context挂在到req上。req.context = context;req.oncomplete = readFileAfterOpen;
* 调用binding.open方法（binding就是c++的fs模块）
* open后，触发readFileAfterOpen， readFileAfterStat，最后来到binding.read方法。
* binding.read就是c++模块的Read方法，它通过判断是否是异步，最后调用AsyncCall AsyncCall(env, req_wrap_async, args, "read", UTF8, AfterInteger,uv_fs_read, fd, &uvbuf, 1, pos);

* AsyncCall的第七个参数uv_fs_read将会被调用，这个函数为：
```c++
int uv_fs_stat(uv_loop_t* loop, uv_fs_t* req, const char* path, uv_fs_cb cb) {
  INIT(STAT);
  PATH;
  POST;
}
```

POST为宏，它很简单，调用了 uv__work_submit

```c++
#define POST                                                                  \
  do {                                                                        \
    if (cb != NULL) {                                                         \
      uv__req_register(loop, req);                                            \
      uv__work_submit(loop,                                                   \
                      &req->work_req,                                         \
                      UV__WORK_FAST_IO,                                       \
                      uv__fs_work,                                            \
                      uv__fs_done);                                           \
      return 0;                                                               \
    }                                                                         \
    else {                                                                    \
      uv__fs_work(&req->work_req);                                            \
      return req->result;                                                     \
    }                                                                         \
  }                                                                           \
  while (0)
```
```js
// 文件位置：/lib/fs.js
function lazyLoadStreams() {
  if (!ReadStream) {
    ({ ReadStream, WriteStream } = require('internal/fs/streams'));
    [ FileReadStream, FileWriteStream ] = [ ReadStream, WriteStream ];
  }
}

function createReadStream(path, options) {
  lazyLoadStreams();
  return new ReadStream(path, options);
}
```

```js
ReadStream.prototype._read = function(n) {
  ...

  // Grab another reference to the pool in the case that while we're
  // in the thread pool another read() finishes up the pool, and
  // allocates a new one.
  const thisPool = pool;
  
  this[kFs].read(
    this.fd, pool, pool.used, toRead, this.pos, (er, bytesRead) => {
      

      if (er) {
        ...
      } else {
        let b = null;
        ...
        

        if (bytesRead > 0) {
          this.bytesRead += bytesRead;
          b = thisPool.slice(start, start + bytesRead);
        }
        // this.push就是调用stream.push方法，调用addChunk
        this.push(b);
      }
    });
    ...
};
```


```js
function addChunk(stream, state, chunk, addToFront) {
  if (state.flowing && state.length === 0 && !state.sync) {
    ...
    stream.emit('data', chunk);
  } else {
    ...
  }
  maybeReadMore(stream, state);
}

function maybeReadMore(stream, state) {
  if (!state.readingMore) {
    state.readingMore = true;
    process.nextTick(maybeReadMore_, stream, state);
  }
}

function maybeReadMore_(stream, state) {
  ...
  while (!state.reading && !state.ended &&
         (state.length < state.highWaterMark ||
          (state.flowing && state.length === 0))) {
    const len = state.length;
    debug('maybeReadMore read 0');
    stream.read(0);
    if (len === state.length)
      // Didn't get any data, stop spinning.
      break;
  }
  state.readingMore = false;
}
```
> 小结：
> fs通过 createReadStream 创建流，然后注册一个on('data')，调用resume，触发flow模式
> flow会无限循环调用read()（其实这里不会无限调用，只调用了一次）。read会调用fs提供的_read方法。
> lib/internal/fs/stream的_read方法通过调用this[kFs].read(),并在cb中，将读取到的数据，调用stream.push()
> stream.push就比较经典了，调用addChunk将数据emit data出去。
> addChunk最后会调用一个 maybeReadMore 再次读取。（这里解决flow中无限循环read只执行一次，以实现源源不断地读取数据，进行流）
> maybeReadMore 通过read(0)来再次调用_read方法，来继续读取数据。
# 四.总结：





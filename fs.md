解读点：nodejs文件读取模块

[TOC]

# 一.故事


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





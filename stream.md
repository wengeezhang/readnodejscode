解读点：nodejs流

[TOC]

# 一.故事
今天10010店铺来了三位客人，分别是王大妈，李大妈，郭大妈。

他们都要采购500斤绿豆，只不过采购的方式有所区别。

* 王大妈：
王大妈自己开着皮卡车来到10010店铺；店铺机器人每次从货架上取100斤绿豆，交给王大妈；
王大妈把绿豆搬到自己车上。循环5次，直到把500斤绿豆搬完。

* 李大妈：
李大妈最近在10010店铺旁边，排了个街边摊，做绿豆糖水售卖给过往的行人。由于物美价廉，生意很好，每天绿豆消耗量基本维持着500斤。
但是李大妈的小推车很小，一次只能存放100斤玉米面。由于靠近店铺，所以李大妈每天一早都先到10010店铺采购500斤绿豆，但是先取100斤。等用完了，再来取100斤，直到把500斤绿豆取完。

* 郭大妈
郭大妈开了一辆特殊的车，后面车厢经过了改造；
车厢上面留了一个口；然后通过一个管道，源源不断地让绿豆流到车厢中。

我们先来看王大妈的采购方式。

## 1. 王大妈采购方式

直接上图，我们看下王大妈的采购场景



玉米 传送带 运转模式

是自动流式，还是手工一点一点传送

# 二.分析和对照

# 三. nodejs源码解读

## 使用场景

## 使用模式（流动或手工）

## 原理讲解


消费者个性化可读流(提供_read) --  基类可读流（read,buffer）  --数据提供者（网络、文件等）

read方法的功能：
1.如果state的buffer中有，则直接读取。
  The readable.read() method pulls some data out of the internal buffer and returns it. 
2.如果没有，则触发_read，从数据提供者那里读取数据到state的buffer中。
3.从数据提供者拿到数据后，需要把数据放到基类可读流的buffer中，这个动作就是push。
  3.1 push如果换个名字，大家就好懂了：pushDataToStreamBuffer

stream的两个模式，三个状态：
1. stream有两个模式：流动模式和暂停模式
2. 三个状态是指：flowing的枚举值有null, false, true。
  2.1 如果一个流被显示地暂停，那么它的状态就变成false。此时再监听data事件，将不会触发流动模式。Attaching a 'data' event listener to a stream that has not been explicitly paused will switch the stream into flowing mode. Data will then be passed as soon as it is available. 

将可读流设置为流动模式的三个方法：
1. resume
2. on('data')（其实是隐藏式地调用了resume）
3. pipe(其实是隐藏式地调用了on('data'))

> 可以看出，其实只有一个方法，即resume，将流变为流动模式

无论哪种方法，如果stream已经监听了readable事件，上述方法都不会生效。即所谓的“readable优先级跟高”
```js
// 首先，只要监听了readable事件，flowing一律显示设置为false
Readable.prototype.on = function(ev, fn) {
  ...
  if (ev === 'data') {
    ...
  } else if (ev === 'readable') {
    if (!state.endEmitted && !state.readableListening) {
      ...
      state.flowing = false;
      ...
    }
  }

  return res;
};

// 再看resume:
Readable.prototype.resume = function() {
  ...
  // 如果是显示停止过，则这里不会有任何效果
  if (!state.flowing) {
    state.flowing = !state.readableListening;
    resume(this, state);
  }
  state[kPaused] = false;
  return this;
};

// 再看data
Readable.prototype.on = function(ev, fn) {
  const res = Stream.prototype.on.call(this, ev, fn);
  const state = this._readableState;

  if (ev === 'data') {
    // Update readableListening so that resume() may be a no-op
    // a few lines down. This is needed to support once('readable').
    state.readableListening = this.listenerCount('readable') > 0;

    // 如果是显示停止过，这里也不会有动作。
    if (state.flowing !== false)
      this.resume();
  } else if (ev === 'readable') {
    ...
  }

  return res;
};
```
而从以上代码可以看出，on('data')最终也是调用resume。

而resume干了啥呢？
从下面的代码可以看出，它最终还是通过一个while循环，不断地触发read。
```js
function resume_(stream, state) {
  debug('resume', state.reading);
  if (!state.reading) {
    stream.read(0);
  }

  state.resumeScheduled = false;
  stream.emit('resume');
  flow(stream);
  if (state.flowing && !state.reading)
    stream.read(0);
}

function flow(stream) {
  const state = stream._readableState;
  debug('flow', state.flowing);
  while (state.flowing && stream.read() !== null);
}
```

从以上分析，可以总结一下：

可读流的应用场景一般有三个：
1. 应用程序直接消费，对应于：on('data')
2. 将可读流pipe给另外一个可写流，对应于：pipe(dest)
3. 自己控制，想消费时再消费，即暂停模式，对应的操作有：on('readable') stream.read()
  在这种模式下，一般都是想读一部分后，做对应的处理。此时如果要想持续读取全部，需要手工设置一个while循环。
  大多数场景下，虽然是暂停模式，其实是读取一部分后，做对应的处理，接着读取其他部分。而不是只读一部分。
  ```js
  // Therefore to read a file's whole contents from a readable, it is necessary to collect chunks across multiple 'readable' events:
  const chunks = [];
  readable.on('readable', () => {
    let chunk;
    while (null !== (chunk = readable.read())) {
      chunks.push(chunk);
    }
  });
  readable.on('end', () => {
    const content = chunks.join('');
  });
  ```

其实仔细分析，前两种模式本质上是同一个。使用on('data', cb)，其实就是把“应用程序虚拟成一个特殊的可写流”，数据不断地提供应用程序。

pipe内部的实现，也是监听data事件，然后把数据给到可写的对象上。

```js
Readable.prototype.pipe = function(dest){
  ...
  src.on('data', ondata);
  function ondata(chunk) {
    ...
    const ret = dest.write(chunk);
    ...
  }
  ...
}
```

问题：
1. 如果同时监听了stream.on('data',cb), stream.pipe(dest)会发生什么呢？
答：因为pipe的本质也是on('data'), 所以如果同时设置了这两个动作，其实也就是意味着有两个消费者。stream基于event，当事件满足需要触发回调时，是把instance._events里面所有的listener都触发一遍。所以数据会同时给到两个消费者。

这跟一个stream,同时pipe多个可写流的效果是一样的，多个可写流对象都会收到数据。


```js
Readable.prototype.read = function(n) {
  debug('read', n);
  // Same as parseInt(undefined, 10), however V8 7.3 performance regressed
  // in this scenario, so we are doing it manually.
  if (n === undefined) {
    n = NaN;
  } else if (!NumberIsInteger(n)) {
    n = parseInt(n, 10);
  }
  const state = this._readableState;
  const nOrig = n;

  // If we're asking for more than the current hwm, then raise the hwm.
  if (n > state.highWaterMark)
    state.highWaterMark = computeNewHighWaterMark(n);

  if (n !== 0)
    state.emittedReadable = false;

  // If we're doing read(0) to trigger a readable event, but we
  // already have a bunch of data in the buffer, then just trigger
  // the 'readable' event and move on.
  if (n === 0 &&
      state.needReadable &&
      ((state.highWaterMark !== 0 ?
        state.length >= state.highWaterMark :
        state.length > 0) ||
       state.ended)) {
    debug('read: emitReadable', state.length, state.ended);
    if (state.length === 0 && state.ended)
      endReadable(this);
    else
      emitReadable(this);
    return null;
  }

  n = howMuchToRead(n, state);

  // If we've ended, and we're now clear, then finish it up.
  if (n === 0 && state.ended) {
    if (state.length === 0)
      endReadable(this);
    return null;
  }

  // All the actual chunk generation logic needs to be
  // *below* the call to _read.  The reason is that in certain
  // synthetic stream cases, such as passthrough streams, _read
  // may be a completely synchronous operation which may change
  // the state of the read buffer, providing enough data when
  // before there was *not* enough.
  //
  // So, the steps are:
  // 1. Figure out what the state of things will be after we do
  // a read from the buffer.
  //
  // 2. If that resulting state will trigger a _read, then call _read.
  // Note that this may be asynchronous, or synchronous.  Yes, it is
  // deeply ugly to write APIs this way, but that still doesn't mean
  // that the Readable class should behave improperly, as streams are
  // designed to be sync/async agnostic.
  // Take note if the _read call is sync or async (ie, if the read call
  // has returned yet), so that we know whether or not it's safe to emit
  // 'readable' etc.
  //
  // 3. Actually pull the requested chunks out of the buffer and return.

  // if we need a readable event, then we need to do some reading.
  let doRead = state.needReadable;
  debug('need readable', doRead);

  // If we currently have less than the highWaterMark, then also read some.
  // 这里发现buffer中没有数据，则顺理成章地要触发_read，于是把doRead设置为true.
  if (state.length === 0 || state.length - n < state.highWaterMark) {
    doRead = true;
    debug('length less than watermark', doRead);
  }

  // However, if we've ended, then there's no point, if we're already
  // reading, then it's unnecessary, and if we're destroyed or errored,
  // then it's not allowed.
  if (state.ended || state.reading || state.destroyed || state.errored) {
    doRead = false;
    debug('reading or ended', doRead);
  } else if (doRead) {
    debug('do read');
    // 这里先设置为reading状态。如果_read是同步的，那么读取完成，它会把reading设置为false。
    // 如果是异步的，那么下面第二个if中的state.reading则依然是true，即还在读取中。
    // 为什么是这样呢？
    // 因为无论是同步，还是异步，读取完成后，都要把读取的数据放到基类的state.buffer中，即调用push(chunk)方法。
    // 我们看下push方法就知道了，它其中一个步骤就是把state.reading = false;
    state.reading = true;
    state.sync = true;
    // If the length is currently zero, then we *need* a readable event.
    if (state.length === 0)
      // needReadable的含义：need trigger readable event
      // 即：是否用户监听了readable事件，并且需要触发
      state.needReadable = true;
    // Call internal read method
    this._read(state.highWaterMark);
    state.sync = false;
    // If _read pushed data synchronously, then `reading` will be false,
    // and we need to re-evaluate how much data we can return to the user.
    if (!state.reading)
      n = howMuchToRead(nOrig, state);
  }

  let ret;
  if (n > 0)
    ret = fromList(n, state);
  else
    ret = null;

  if (ret === null) {
    state.needReadable = state.length <= state.highWaterMark;
    n = 0;
  } else {
    state.length -= n;
    if (state.multiAwaitDrain) {
      state.awaitDrainWriters.clear();
    } else {
      state.awaitDrainWriters = null;
    }
  }

  if (state.length === 0) {
    // If we have nothing in the buffer, then we want to know
    // as soon as we *do* get something into the buffer.
    if (!state.ended)
      state.needReadable = true;

    // If we tried to read() past the EOF, then emit end on the next tick.
    if (nOrig !== n && state.ended)
      endReadable(this);
  }

  if (ret !== null)
    this.emit('data', ret);

  return ret;
};
```

拿文件读取流来举例，fs.createReadStream，它的代码为：
```js
function createReadStream(path, options) {
  lazyLoadStreams();
  return new ReadStream(path, options);
}

// ReadStream为lib/internal/fs/stream下的一个class。

function ReadStream(path, options) {
  ...
  // 指定kFs为fs，即lib/fs模块。require('fs')
  this[kFs] = options.fs || fs;

  ...

  Readable.call(this, options);

}

// 重点来了，我们看下它的实现。
// 注意：创建一个流，可以通过继承的方式，也可以直接使用_stream_reaable。如果是前者，则直接设定_read方法。
// 如果是后者，则需要在初始化 _stream_readable 的实例是，设定opts中的read方法（_stream_readable构造函数内部会把read赋给_read）
ReadStream.prototype._read = function(n) {
  ...
  // the actual read.
  this[kIsPerformingIO] = true;
  // 这里的this[kFs]就是lib/fs模块，它的read方法。
  // 这里看最后一个参数，是一个回调函数，
  this[kFs].read(
    this.fd, pool, pool.used, toRead, this.pos, (er, bytesRead) => {
      
      if (er) {
        ...
      } else {
        ...
        // 可以看出，个性化的_read的最后一步就是push。
        this.push(b);
      }
    });
  ...
};
```


# 四.总结：





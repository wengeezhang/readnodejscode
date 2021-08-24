解读点：nodejs流

[TOC]

# 一.故事


# 二.分析和对照

# 三. nodejs源码解读

消费者个性化可读流(_read) --  可读流（read,buffer）  --数据提供者（网络、文件等）

read方法的功能：
1.如果state的buffer中有，则直接读取。
2.如果没有，则触发_read，从数据提供者那里读取数据到state的buffer中。

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
    // 如果是异步的，那么117行中的state.reading则依然是true，即还在读取中。
    state.reading = true;
    state.sync = true;
    // If the length is currently zero, then we *need* a readable event.
    if (state.length === 0)
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
# 四.总结：





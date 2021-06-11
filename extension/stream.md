##Stream(流式)引起的思考
在做微信支付soa系统的应用层服务时，有几个老的接口（xphp）需要清理。由于时间紧迫，因此先在nodejs层做转发。

转发采用nodejs原生内置的http.request。

写代码是发现，如果写了await，但是后面promise没有resolve，那么代码的环境将会被保存。
虽然结果正常返回给了前端，但是nodejs进程将永远保留这个请求对应的函数以及变量。

长期下去，请求量一多，内存将直线上升。

## koajs下，正确的流式转发
```js
// router的controller
async editLevel(ctx) {
    await transparentReq(ctx, {transUrl: 'http://soa.wxpaytest.oa.com/risk/risk_level'});
};

async transparentReq(ctx, opts){
    // 首先创建一个promise，主要是等待http.request的返回对象到来
    const resStream = await new Promise(async (resolve, reject) => {
        const req = http.request(opts && opts.transUrl || ctx.request.url, {
            method: ctx.method,
            headers: {
                'Content-Type': ctx.headers['content-type'],
            }
        }, (res) => {
            resolve(res);
        })
        ctx.set('content-type', 'application/json;utf8');
        ctx.req.pipe(req);
    });
    // 将http.request的返回流，赋给koajs的ctx.body
    ctx.body = resStream;
    console.log('transparentReq finished!!');
    },
```

解读：
* 首先koajs底层的封装有待提升，使得业务开发直接使用时，有很多困惑。
    * koajs的源文件中（lib/application.js）respond方法大致如下：“const res = ctx.res;let body = ctx.body;... if (body instanceof Stream) return body.pipe(res);”
    * 可以看出，这里将ctx.body给到ctx.res(nodejs的原生response对象)

* 如果不设置await，而是在http.request的回调中设置“ctx.body = res”,即如下方式：
```js
async transparentReq(ctx, opts){
    const req = http.request(opts && opts.transUrl || ctx.request.url, {
        method: ctx.method,
        headers: {
            'Content-Type': ctx.headers['content-type'],
        }
    }, (res) => {
        // 直接将res给到ctx.body
        ctx.body = res; 
    })
    ctx.set('content-type', 'application/json;utf8');
    ctx.req.pipe(req);
    },
```

这样的后果是transparentReq将立马返回，koajs会继续执行中间件，中间件执行完毕，会立即执行lib/application.js中的respond。此时ctx.body还没有被赋值，就会造成意向不到的结果。
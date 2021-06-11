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
* 
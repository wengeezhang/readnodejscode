
事先声明：本文分析基于nodejs 14版本; 
[TOC]
# nodejs进程启动流程探析

本文将分析nodejs进程启动的全流程，但不包括后续的请求处理流程。
>（注：本文主要是借助“vscode+lldb”进行断点分析的）

## nodejs启动入口
nodejs是用C++开发的，因此它启动的入口在node_main.cc中。

```js
int main(int argc, char* argv[]) {
  ...
  return node::Start(argc, argv);
  ...
}
```

可以看到，其实是通过node::Start来启动。

## node::Start

node::Start在/src/node.cc中。我们看下他的代码。

```js
int Start(int argc, char** argv) {
  InitializationResult result = InitializeOncePerProcess(argc, argv);
  ...

  {
    ...

    NodeMainInstance main_instance(&params,
                                   uv_default_loop(),
                                   per_process::v8_platform.Platform(),
                                   result.args,
                                   result.exec_args,
                                   indexes);
    result.exit_code = main_instance.Run();
  }

  TearDownOncePerProcess();
  return result.exit_code;
}
```

可以看到，主要分为两部分，InitializeOncePerProcess()和main_instance.Run()。

这里，作者先透漏一下这两部分的作用：

* InitializeOncePerProcess： 每个进程初始化一次，主要是
  * 注册build-in模块（即用C++写的模块，比如/src/tcp_wrap.cc）
  * 初始化v8

> 简单来说，就是把C++模块注册好，以供后续调用。

* main_instance.Run: 
  * 初始化环境（创建一个env，后续都会用到这个变量）；
  * 加载环境中指定的东西，即加载业务js(即node app.js指定的app.js)（实际上很复杂，我们后续一一分析），并执行；
  * 启动完成，并把uv_run跑起来。

> 简单来说，就是把内置的js模块准备好，并允许业务的js代码。

我们先看下整体的调用图：
![alt 图片](../../img/nodestarttwosteps.png)
## InitializeOncePerProcess探析

那我们就来看下，nodejs启动两大步（InitializeOncePerProcess和main_instance.Run）中的第一步InitializeOncePerProcess干了啥。

## main_instance.Run探析

那我们就来看下，nodejs启动两大步（InitializeOncePerProcess和main_instance.Run）中的第二步main_instance.Run干了啥。

### loaders
在main_instance.Run中，创建完env后，执行的env.RunBootstrapping中，分为两大步

* BootstrapInternalLoaders: 启动/lib/internal/bootstrap/loaders.js
* BootstrapNode： 启动/lib/internal/bootstrap/node.js

/lib/internal/bootstrap/loaders.js是干啥的呢？

首先明确以下概念：

* process.binding: 历史遗留的buildin模块的绑定方法，现在基本不建议用。
* process._linkedbinding: 用户自己开发的C++ addons
* internalbinding: 新的build-in module绑定方法，也就是process.binding的替代者。不过这个方法用户不可见。

从源码可以看出，process.binding就是在调用internalBinding

```js
process.binding = function binding(module) {
    module = String(module);
    // Deprecated specific process.binding() modules, but not all, allow
    // selective fallback to internalBinding for the deprecated ones.
    if (internalBindingWhitelist.has(module)) {
      return internalBinding(module);
    }
    // eslint-disable-next-line no-restricted-syntax
    throw new Error(`No such module: ${module}`);
  };
```

接着，我们看下/lib/internal/loaders.js的作用:
* 初始化一些东西，比如设置process.binding, process._linkedBinding; 
* 同时准备internalBinding和nativeModuleReqiuire给到C++世界（后续C++通过ExecutionBootStrapper启动内置js文件时，就可以直接传入这两个参数给js文件,比如后面紧接着调用/lib/internal/bootstrap/node.js，/lib/internal/bootstrap/pre_execution.js,/lib/main/run_main_module.js等）
* 同时把internalBinding和nativeModuleRequire暴露出来给native模块使用（这样native中的js也就可以直接使用internalBinding和nativeModuleRequire）。

我们看下，/lib/interanl/loaders.js最后暴露的东西
```js
...
const loaderExports = {
  internalBinding,
  NativeModule,
  require: nativeModuleRequire
};
...
```

### 加载业务模块
我们看下，什么时候开始执行业务模块。

执行完env.runBootstrapping后，node进程开始调用loadEnvrionment。这个函数主要加载一个文件：
/lib/internal/main/run_main_module.js。
这个文件很简单，我们看下它的全部代码：

```js
'use strict';

const {
  prepareMainThreadExecution
} = require('internal/bootstrap/pre_execution');

prepareMainThreadExecution(true);

markBootstrapComplete();

require('internal/modules/cjs/loader').Module.runMain(process.argv[1]);

```
注意，由于这个模块还是属于native模块，因此这个文件执行时，代码里面的require还是nativeModuleRequire(即包裹文件内容时，function(exports, require,...){// run_main_module.js的内容}的require设定为nativeModuleRequire).

从这里开始，require开始变化了，不再是nativeModuleRequire。怎么开出来呢？我们来看看这个

```js
require('internal/modules/cjs/loader').Module.runMain
```

其实在执行这个文件前，node进程还执行了另外一个文件, /lib/internal/bootstrap/pre_execution.js，它主要做了一件事，设置cjs/loader中的Module的runMain方法。

```js
// /lib/internal/bootstrap/pre_execution.js
...
function initializeCJSLoader() {
  const CJSLoader = require('internal/modules/cjs/loader');
  CJSLoader.Module._initPaths();
  // TODO(joyeecheung): deprecate this in favor of a proper hook?
  CJSLoader.Module.runMain =
    require('internal/modules/run_main').executeUserEntryPoint;
}
...
```

可以看出，require('internal/modules/cjs/loader').Module.runMain就是require('internal/modules/run_main').executeUserEntryPoint。

那么我们看下这个函数：

```js
// lib/internal/modules/run_main.js
const CJSLoader = require('internal/modules/cjs/loader');
const { Module, toRealPath, readPackageScope } = CJSLoader;

...

function executeUserEntryPoint(main = process.argv[1]) {
  const resolvedMain = resolveMainPath(main);
  const useESMLoader = shouldUseESMLoader(resolvedMain);
  if (useESMLoader) {
    runMainESM(resolvedMain || main);
  } else {
    // Module._load is the monkey-patchable CJS module loader.
    Module._load(main, null, true);
  }
}

```

注意，此时的lib/internal/modules/run_main.js，还是native模块。

可以看出，require('internal/modules/cjs/loader').Module.runMain(process.argv[1]);最终变成了：

Module._load(process.argv[1], null, true);

这个process.argv[1]就是node app.js中的app.js。

也就是说，从此开始，Module._load开始接手。

### Module._load的循环套路

我们知道，业务代码里面肯定会require别的模块，别的模块同样也会require其他的模块，循环不止。

当然，业务模块也会require一个native模块。

这就使得Module._load既要能够加载普通的业务js模块，也要能够加载native模块。

我们来看下它的代码：

```js
// lib/internal/modules/cjs/loader.js
Module._load = function(request, parent, isMain) {
  
  ...
  // 1.首先看缓存中有没有
  const filename = Module._resolveFilename(request, parent, isMain);
  const cachedModule = Module._cache[filename];
  ...

  // 2.然后尝试当做native模块来加载
  const mod = loadNativeModule(filename, request);
  if (mod && mod.canBeRequiredByUsers) return mod.exports;

  // 3.以上都没有，则初始化，然后调用module.load
  const module = new Module(filename, parent);
  ...
  try {
      ...
        module.load(filename);
      ...
  }

  return module.exports;
};
```

我们看下module.load的代码：

```js
// lib/internal/modules/cjs/loader.js
Module.prototype.load = function(filename) {
  ...
  this.filename = filename;
  ...
  Module._extensions[extension](this, filename);
  ...
};
```
Module._extensions[extension]就是比较经典的按照文件类型来加载，我们主要关注js。

```js
// lib/internal/modules/cjs/loader.js
Module._extensions['.js'] = function(module, filename) {
  ...
  const content = fs.readFileSync(filename, 'utf8');
  module._compile(content, filename);
};
```

把棒交接给了module._compile。我们看下它的代码

```js
// lib/internal/modules/cjs/loader.js
Module.prototype._compile = function(content, filename) {
  ...
  // 1.包裹函数
  // wrapSafe就是把文件内容包裹上一个function (exports, require, module, __filename, __dirname){}
  // 详细参见wrapSafe代码，这里就不展开了。
  const compiledWrapper = wrapSafe(filename, content, this);
  ...
  
  // 此时的compiledWrapper就是一个函数，这个函数是这样的
  // function (exports, require, module, __filename, __dirname){
  //  ...要加载的目标js文件内容...  
  // }

  // 2. 调用函数
  // 调用函数，就需要准备参数，其中最重要的就是第二个参数requir
  ...
  const require = makeRequireFunction(this, redirects);
  let result;
  const exports = this.exports;
  const thisValue = exports;
  const module = this;
  ...
  if (inspectorWrapper) {
    ...
  } else {
    result = compiledWrapper.call(thisValue, exports, require, module,
                                  filename, dirname);
  }
  ...
  return result;
};
```

我们看下这个makeRequireFunction做了啥

```js
// lib/internal/modules/cjs/helper.js  可以理解为cjs的工具文件
function makeRequireFunction(mod, redirects) {
  const Module = mod.constructor;

  let require;
  if (redirects) {
    ...
    require = function require(path) {
      ...
      if (destination === true) {
        ...
      } else if (destination) {
        const href = destination.href;
        if (destination.protocol === 'node:') {
          ...
          // 尝试作为nativeModule加载
          const mod = loadNativeModule(specifier, href);
          if (mod && mod.canBeRequiredByUsers) {
            return mod.exports;
          }
          ...
        } else if (destination.protocol === 'file:') {
          ...
          return mod.require(filepath);
        }
      }
      ...
      return mod.require(path);
    };
  } else {
    require = function require(path) {
      return mod.require(path);
    };
  }
  
  ...

  return require;
}
```

由此来见，这个准备好的require,无非调用mod.require（如果是nativeModule，则调用loadNativeModule）。

我们来看看这个mod.require是什么。

```js
// lib/internal/modules/cjs/loader.js
Module.prototype.require = function(id) {
  ...
  try {
    return Module._load(id, this, /* isMain */ false);
  } finally {
    requireDepth--;
  }
};
```

看到了吧，最终又调用了Module._load。

也就是说，包裹好的函数调用时，传入的require，就是Module._load。

这就是Module._load一统user-land js模块的由来。

### native模块加载
所有的内部模块加载，分为两路：
1. 一路是启动时，有C++代码通过ExecutionBootstrapper调用native模块；
比如env.runBootStrapping中，调用了lib/internal/bootstrap/loaders.js。我们看下代码：
```js
MaybeLocal<Value> ExecuteBootstrapper(Environment* env,
                                      const char* id,
                                      std::vector<Local<String>>* parameters,
                                      std::vector<Local<Value>>* arguments) {
  EscapableHandleScope scope(env->isolate());
  MaybeLocal<Function> maybe_fn =
      NativeModuleEnv::LookupAndCompile(env->context(), id, parameters, env);
  
  ...

  // 这里的fn，就是类似user-land中包裹后的函数。
  // 只不过外面包裹的是类似function (ctx, isolate, arvc, argv){}
  Local<Function> fn = maybe_fn.ToLocalChecked();
  // 然后这里调用，然后传入参数。
  MaybeLocal<Value> result = fn->Call(env->context(),
                                      Undefined(env->isolate()),
                                      arguments->size(),
                                      arguments->data());

  ...

  return scope.EscapeMaybe(result);
}

```

可以看到，这里最终调用了NativeModuleEnv::LookupAndCompile。其实它最后调用了NativeModuleLoader::LookupAndCompile

2. native模块中，通过nativeModuleRequire调用另外一个模块。
```js
// lib/internal/bootstrap/loaders.js
function nativeModuleRequire(id) {
  if (id === loaderId) {
    return loaderExports;
  }

  const mod = NativeModule.map.get(id);
  // Can't load the internal errors module from here, have to use a raw error.
  // eslint-disable-next-line no-restricted-syntax
  if (!mod) throw new TypeError(`Missing internal module '${id}'`);
  return mod.compileForInternalLoader();
}

...

compileForInternalLoader() {
    ...

    try {
      ...
      const fn = compileFunction(id);
      fn(this.exports, requireFn, this, process, internalBinding, primordials);
      ...
    } finally {
      ...
    }
    ...
    return this.exports;
  }

...

const {
  moduleIds,
  compileFunction
} = internalBinding('native_module');
...
```
compileFunction是node_native_module_env.cc中的函数：

```js
// /src/node_native_module_env.cc
void NativeModuleEnv::CompileFunction(const FunctionCallbackInfo<Value>& args) {
  ...
  MaybeLocal<Function> maybe =
      NativeModuleLoader::GetInstance()->CompileAsModule(
          env->context(), id, &result);
  ...
}

// /src/node_native_module.cc

MaybeLocal<Function> NativeModuleLoader::CompileAsModule(
    Local<Context> context,
    const char* id,
    NativeModuleLoader::Result* result) {
  ...
  return LookupAndCompile(context, id, &parameters, result);
}
```

可以看到，这里最终也是调用了NativeModuleLoader::LookupAndCompile

那么我们就来看看这个NativeModuleLoader::LookupAndCompile到底是啥。

```js
// /src/node_native_module.cc
MaybeLocal<Function> NativeModuleLoader::LookupAndCompile(
    Local<Context> context,
    const char* id,
    std::vector<Local<String>>* parameters,
    NativeModuleLoader::Result* result) {
  
  ...

  // 尝试作为builtin模块加载
  if (!LoadBuiltinModuleSource(isolate, id).ToLocal(&source)) {
    return {};
  }

  // 到这里，表明不是builtin模块，因此正式开始加载逻辑
  std::string filename_s = id + std::string(".js");
  
  ...

  ScriptCompiler::Source script_source(source, origin, cached_data);

  MaybeLocal<Function> maybe_fun =
      ScriptCompiler::CompileFunctionInContext(context,
                                               &script_source,
                                               parameters->size(),
                                               parameters->data(),
                                               0,
                                               nullptr,
                                               options);

  
  Local<Function> fun = maybe_fun.ToLocalChecked();
  
  ...

  return scope.Escape(fun);
}
```
最终调用了ScriptCompiler::CompileFunctionInContext。这个函数代码如下：

```js
// src/deps/v8/src/api.cc
MaybeLocal<Function> ScriptCompiler::CompileFunctionInContext(
    Local<Context> v8_context, Source* source, size_t arguments_count,
    Local<String> arguments[], size_t context_extension_count,
    Local<Object> context_extensions[], CompileOptions options,
    NoCacheReason no_cache_reason,
    Local<ScriptOrModule>* script_or_module_out) {
  Local<Function> result;

  {
    ...

    i::Handle<i::JSFunction> scoped_result;
    has_pending_exception =
        !i::Compiler::GetWrappedFunction(
             Utils::OpenHandle(*source->source_string), arguments_list, context,
             script_details, source->resource_options, script_data, options,
             no_cache_reason)
             .ToHandle(&scoped_result);
    result = handle_scope.Escape(Utils::CallableToLocal(scoped_result));
  }

  ...

  return result;
}
```

可以看到，它其实是i::Compiler::GetWrappedFunction(...).ToHandle(&scoped_result),把包裹后的函数付给了scoped_result，最终赋值给了result。

GetWrappedFunction是/deps/v8/src/codegen/compile.cc中，包裹函数的方法。
它的声明是这样的：

```js
MaybeHandle<JSFunction> Compiler::GetWrappedFunction(

```

可见它返回的是一个JSFunction。


至此，加载native模块的逻辑分析完毕。

/*
 * grunt
 * http://gruntjs.com/
 *
 * Copyright (c) 2015 "Cowboy" Ben Alman
 * Licensed under the MIT license.
 * https://github.com/gruntjs/grunt/blob/master/LICENSE-MIT
 */

(function(exports) {

  'use strict';

  // Task对象构造函数
  function Task() {
    // 用来记录当前正在运行的任务
    this.current = {};
    // 用来缓存注册过的任务
    this._tasks = {};
    // 任务队列
    this._queue = [];
    // Queue placeholder (for dealing with nested tasks).
    this._placeholder = {placeholder: true};
    // Queue marker (for clearing the queue programmatically).
    this._marker = {marker: true};
    // 参数对象
    this._options = {};
    // 标记任务是否在运行
    this._running = false;
    // 用来记录任务的执行结果
    this._success = {};
  }

  exports.Task = Task;

  exports.create = function() {
    return new Task();
  };

  // 如果任务正在运动并且error方法没有定义直接抛出错误
  // 否则调用error方法处理错误
  Task.prototype._throwIfRunning = function(obj) {
    if (this._running || !this._options.error) {
      // 如果任务正在运行并且没有定义error方法，那么直接抛出错误
      throw obj;
    } else {
      // 否则调用error方法处理错误
      this._options.error.call({name: null}, obj);
    }
  };

  // 注册任务
  Task.prototype.registerTask = function(name, info, fn) {
    // 如果没有传递info，调整参数
    // 比如grunt.registerTask('taskName',function(){})的情况
    // 这时候info为function函数，所以把info赋值给fn
    if (fn == null) {
      fn = info;
      info = null;
    }
    // 如果fn是字符串或者字符串数组
    // 比如grunt.registerTask('task',['task1','task2','task3'])的情况
    var tasks;
    if (typeof fn !== 'function') {
      // 针对上面的情况，这时候tasks=['task1','task2','task3']
      tasks = this.parseArgs([fn]);
      // 将任务的函数改为将每个子任务添加到任务队列中
      // 也就是分别将task1,task2和task3加入任务队列中
      fn = this.run.bind(this, fn);
      fn.alias = true;
      // 这种情况下task相当于task1,task2和task3任务组合的别名
      if (!info) {
        info = 'Alias for "' + tasks.join('", "') + '" task' +
          (tasks.length === 1 ? '' : 's') + '.';
      }
    } else if (!info) {
      info = 'Custom task.';
    }
    // 将任务加入到缓存中
    this._tasks[name] = {name: name, info: info, fn: fn};
    // 返回任务对象，支持链式调用
    return this;
  };

  // 判断一个任务是否是一系列子任务的别名
  Task.prototype.isTaskAlias = function(name) {
    return !!this._tasks[name].fn.alias;
  };

  // 判断任务是否注册
  Task.prototype.exists = function(name) {
    return name in this._tasks;
  };

  // 重命名任务
  Task.prototype.renameTask = function(oldname, newname) {
    // 如果任务不存在，则抛出错误
    if (!this._tasks[oldname]) {
      throw new Error('Cannot rename missing "' + oldname + '" task.');
    }
    // 重命名任务
    this._tasks[newname] = this._tasks[oldname];
    // 修改任务的名称
    this._tasks[newname].name = newname;
    // 删除旧的任务
    delete this._tasks[oldname];
    // 支持链式调用
    return this;
  };

  // 对参数进行转换，将参数转换为数组，比如：
  //  fn('foo')                 ==>  ['foo']
  //  fn('foo', 'bar', 'baz')   ==>  ['foo', 'bar', 'baz']
  //  fn(['foo', 'bar', 'baz']) ==>  ['foo', 'bar', 'baz']
  Task.prototype.parseArgs = function(args) {
    // 如果参数的第一项是数组那么直接返回第一项
    // 否则将参数列表转换为数组
    return Array.isArray(args[0]) ? args[0] : [].slice.call(args);
  };

  // 将任务名根据冒号转换为数组，比如：
  // task:task1:args   ==>  ['task','task1','args']
  Task.prototype.splitArgs = function(str) {
    if (!str) { return []; }
    str = str.replace(/\\\\/g, '\uFFFF').replace(/\\:/g, '\uFFFE');
    return str.split(':').map(function(s) {
      return s.replace(/\uFFFE/g, ':').replace(/\uFFFF/g, '\\');
    });
  };

  // 将任务名分离为真实运行的任务名和参数的对象，比如：
  // 'foo'  ==>  任务名为foo，没有参数
  // 'foo:bar:baz'  ==>  如果'foo:bar:baz'任务存在，那么任务名为'foo:bar:baz'，没有参数
  //                ==>  如果'foo:bar'任务存在，那么任务名为'foo:bar'，参数为'baz'
  //                ==>  如果'foo'任务存在，那么任务名为'foo'，参数为'bar'和'baz'
  Task.prototype._taskPlusArgs = function(name) {
    // 将传入的任务名根据冒号转换为数组
    var parts = this.splitArgs(name);
    // 从数组最后开始遍历数组
    var i = parts.length;
    var task;
    do {
      // 将0到i的数组转换为任务名，用冒号隔开
      // 然后根据得到的任务名从任务缓存中得到相应的任务
      task = this._tasks[parts.slice(0, i).join(':')];
      // 如果相应任务不存在，那么i减1，知道i等于0
    } while (!task && --i > 0);
    // 除了任务名以外的部分属于参数
    var args = parts.slice(i);
    // 根据参数列表，得到相应的boolean型标记
    var flags = {};
    args.forEach(function(arg) { flags[arg] = true; });
    // 返回构建的任务对象，包括任务名和任务参数
    return {task: task, nameArgs: name, args: args, flags: flags};
  };

  // 将任务加入到任务队列相应位置中
  Task.prototype._push = function(things) {
    // 获得placeholder的位置
    var index = this._queue.indexOf(this._placeholder);
    if (index === -1) {
      // 如果没有placeholder，那么直接将任务加入到队列尾部
      this._queue = this._queue.concat(things);
    } else {
      // 否则将任务加入到placeholder之前
      [].splice.apply(this._queue, [index, 0].concat(things));
    }
  };

  // 将任务加入到队列中
  Task.prototype.run = function() {
    // 将参数转换为数组并且根据参数构建任务对象
    var things = this.parseArgs(arguments).map(this._taskPlusArgs, this);
    // 找出无法构建的任务
    var fails = things.filter(function(thing) { return !thing.task; });
    if (fails.length > 0) {
      // 如果存在无法构建的任务，抛出错误并返回
      this._throwIfRunning(new Error('Task "' + fails[0].nameArgs + '" not found.'));
      return this;
    }
    // 将任务加入到任务队列相应的位置
    this._push(things);
    // 支持链式调用
    return this;
  };

  // 向任务队列中加入marker标记，在清空任务列表时会用到
  Task.prototype.mark = function() {
    this._push(this._marker);
    // 支持链式调用
    return this;
  };

  // 运行任务的注册函数
  Task.prototype.runTaskFn = function(context, fn, done, asyncDone) {
    // 标记是否异步
    var async = false;

    // 执行函数完成之后的工作，更新任务状态，执行done函数也就是运行下一个任务
    var complete = function(success) {
      var err = null;
      if (success === false) {
        // 任务运行失败，创建错误对象
        err = new Error('Task "' + context.nameArgs + '" failed.');
      } else if (success instanceof Error || {}.toString.call(success) === '[object Error]') {
        // 如果传入的是错误对象，表示任务执行失败
        err = success;
        success = false;
      } else {
        // 任务运行成功
        success = true;
      }
      // 任务结束后重置当前运行任务
      this.current = {};
      // 记录任务执行结构
      this._success[context.nameArgs] = success;
      // 如果任务失败则调用错误处理函数
      if (!success && this._options.error) {
        this._options.error.call({name: context.name, nameArgs: context.nameArgs}, err);
      }
      // 如果指定了异步执行，那么使用node自带的nextTick来运行done
      // 否则直接运行done
      if (asyncDone) {
        process.nextTick(function() {
          done(err, success);
        });
      } else {
        done(err, success);
      }
    }.bind(this);

    // 用来支持异步任务，也就是this.async()方法的实现，
    // 返回函数在异步任务完成时被调用执行complete方法
    context.async = function() {
      async = true;
      // 返回的函数在任务中的异步工作完成后被调用
      return function(success) {
        setTimeout(function() { complete(success); }, 1);
      };
    };

    // 记录当前正在运行的任务上下文
    this.current = context;

    try {
      // 执行任务的注册函数
      var success = fn.call(context);
      // 如果没有使用this.async
      // 也就是说async标记为false时在任务完成之后直接调用complete方法
      if (!async) {
        complete(success);
      }
    } catch (err) {
      complete(err);
    }
  };

  // 开始运行任务队列中的任务
  Task.prototype.start = function(opts) {
    //初始化opts对象
    if (!opts) {
      opts = {};
    }
    // 如果任务正在运行则退出
    if (this._running) { return false; }
    // 通过nextTask依次运行队列中的任务
    var nextTask = function() {
      // 用来保存从队列中取出的任务对象
      var thing;
      // Skip any placeholders or markers.？？？
      do {
        //取出队列中的任务对象
        thing = this._queue.shift();
      } while (thing === this._placeholder || thing === this._marker);
      // 如果队列为空，那么完成任务，执行可选的done函数并返回
      if (!thing) {
        this._running = false;
        if (this._options.done) {
          this._options.done();
        }
        return;
      }
      // 向队列中插入一个placeholder
      this._queue.unshift(this._placeholder);

      // 使用取出的任务对象构造任务函数的上下文对象
      var context = {
        // 任务名称:target名称:参数
        nameArgs: thing.nameArgs,
        // 任务名称
        name: thing.task.name,
        // 任务参数，这个参数包括了除了任务名以外的东西，包括target名称和参数
        args: thing.args,
        // 以args为键的键值对，值为true
        flags: thing.flags
      };

      // 运行任务的注册函数，上下文设置为上面构造的context函数
      this.runTaskFn(context, function() {
        return thing.task.fn.apply(this, this.args);
      }, nextTask, !!opts.asyncDone);

    }.bind(this);

    // 把任务标记为正在运行
    this._running = true;
    // 运行任务队列中的下一个任务
    nextTask();
  };

  // 清空队列中的任务
  Task.prototype.clearQueue = function(options) {
    // 初始化options对象
    if (!options) { options = {}; }
    // 如果options带有untilMarker，那么将0到marker位置的任务情况
    if (options.untilMarker) {
      this._queue.splice(0, this._queue.indexOf(this._marker) + 1);
    } else {
      this._queue = [];
    }
    // 支持链式调用
    return this;
  };

  // 判断某个任务是否运行成功，如果有任务失败方法会抛出错误
  Task.prototype.requires = function() {
    this.parseArgs(arguments).forEach(function(name) {
      var success = this._success[name];
      if (!success) {
        throw new Error('Required task "' + name +
          '" ' + (success === false ? 'failed' : 'must be run first') + '.');
      }
    }.bind(this));
  };

  // 设置_options对象
  Task.prototype.options = function(options) {
    Object.keys(options).forEach(function(name) {
      this._options[name] = options[name];
    }.bind(this));
  };

}(typeof exports === 'object' && exports || this));

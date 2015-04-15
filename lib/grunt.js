/*
 * grunt
 * http://gruntjs.com/
 *
 * Copyright (c) 2015 "Cowboy" Ben Alman
 * Licensed under the MIT license.
 * https://github.com/gruntjs/grunt/blob/master/LICENSE-MIT
 */

'use strict';

// 加载node自带的路径解析模块
var path = require('path');

// 加载'coffee-script'模块，以支持coffee文件
require('coffee-script');

// 声明grunt对象
var grunt = module.exports = {};

// 根据名字向grunt对象添加相应属性，而这些属性来自grunt内部的模块
function gRequire(name) {
  return grunt[name] = require('./grunt/' + name);
}
// 加载grunt工具模块
var util = require('grunt-legacy-util');
grunt.util = util;
// 加载工具文件夹下的task模块
grunt.util.task = require('./util/task');
// 加载log模块
var Log = require('grunt-legacy-log').Log;
var log = new Log({grunt: grunt});
grunt.log = log;
// 依次将grunt的内部模块添加到grunt对象上
gRequire('template');
gRequire('event');
var fail = gRequire('fail');
gRequire('file');
var option = gRequire('option');
var config = gRequire('config');
var task = gRequire('task');
var help = gRequire('help');
gRequire('cli');
var verbose = grunt.verbose = log.verbose;

// 加载grunt包信息
grunt.package = require('../package.json');
grunt.version = grunt.package.version;

// 将grunt内部模块的方法添加到grunt对象中
function gExpose(obj, methodName, newMethodName) {
  grunt[newMethodName || methodName] = obj[methodName].bind(obj);
}
gExpose(task, 'registerTask');
gExpose(task, 'registerMultiTask');
gExpose(task, 'registerInitTask');
gExpose(task, 'renameTask');
gExpose(task, 'loadTasks');
gExpose(task, 'loadNpmTasks');
gExpose(config, 'init', 'initConfig');
gExpose(fail, 'warn');
gExpose(fail, 'fatal');

// 将tasks接口添加到grunt对象中，tasks方法用来运行任务
// 这个tasks方法一般只在grunt内部调用
grunt.tasks = function(tasks, options, done) {
  // option模块对命令行参数进行包装
  // init方法对参数进行了初始化，在方法内部判断传入参数是否为空
  // 如果为空则初始化为空对象否则使用传入的对象进行初始化
  option.init(options);

  var _tasks, _options;
  // option方法接受可变属性的参数，
  // 如果传入一个参数则在参数对象中找出对于的参数，
  // 如果传入两个参数则根据这两个参数设置key-value键值对，并value
  // 同时方法内部会用正则匹配no-color、no-write的情况，
  // 如果出现则设置option['color']或option['write']为false，并返回false
  if (option('version')) {
    // 如果带有version参数
    // 输出版本信息
    log.writeln('grunt v' + grunt.version);

    if (option('verbose')) {
      // //输出详细信息，包括grunt的路径
      verbose.writeln('Install path: ' + path.resolve(__dirname, '..'));

      grunt.log.muted = true;
      // 初始化任务系统，解析gruntfile以便输出所有可用的任务
      grunt.task.init([], {help: true});
      grunt.log.muted = false;

      // 输出可用的任务信息
      _tasks = Object.keys(grunt.task._tasks).sort();
      verbose.writeln('Available tasks: ' + _tasks.join(' '));

      // 输出所有可用参数的详细信息
      _options = [];
      Object.keys(grunt.cli.optlist).forEach(function(long) {
        var o = grunt.cli.optlist[long];
        _options.push('--' + (o.negate ? 'no-' : '') + long);
        if (o.short) { _options.push('-' + o.short); }
      });
      verbose.writeln('Available options: ' + _options.join(' '));
    }

    return;
  }

  // 初始化log的着色功能
  log.initColors();

  // 如果参数带有help则输出帮助信息
  if (option('help')) {
    help.display();
    return;
  }

  // 根据option输出命令行参数，flags方法会过滤掉值为空的参数
  verbose.header('Initializing').writeflags(option.flags(), 'Command-line options');

  // 判断是否有传入tasks参数并且任务长度大于0
  var tasksSpecified = tasks && tasks.length > 0;
  //将传入参数进行转换，转换为任务数组，如果没有传入有效的任务那么使用默认default任务
  tasks = task.parseArgs([tasksSpecified ? tasks : 'default']);

  // 根据传入的tasks参数初始化任务
  task.init(tasks, options);

  verbose.writeln();
  if (!tasksSpecified) {
    verbose.writeln('No tasks specified, running default tasks.');
  }
  verbose.writeflags(tasks, 'Running tasks');

  // 注册异常处理函数，输出异常信息
  var uncaughtHandler = function(e) {
    fail.fatal(e, fail.code.TASK_FAILURE);
  };
  process.on('uncaughtException', uncaughtHandler);

  task.options({
    error: function(e) {
      fail.warn(e, fail.code.TASK_FAILURE);
    },
    done: function() {
      // 当任务完成之后移除异常监听函数，减少多余的开销
      process.removeListener('uncaughtException', uncaughtHandler);

      // 输出最后的运行结果，失败或者成功
      fail.report();

      if (done) {
        // 如果存在done函数的话，当完成任务时执行done函数
        done();
      } else {
        // 如果没有done函数直接结束进程
        util.exit(0);
      }
    }
  });

  // 将任务依次加入内部的任务队列中，run方法并不会运行任务，只是加入到队列中
  tasks.forEach(function(name) { task.run(name); });
  // 开始运行任务队列中的任务
  task.start({asyncDone:true});
};

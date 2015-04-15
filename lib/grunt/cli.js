/*
 * grunt
 * http://gruntjs.com/
 *
 * Copyright (c) 2015 "Cowboy" Ben Alman
 * Licensed under the MIT license.
 * https://github.com/gruntjs/grunt/blob/master/LICENSE-MIT
 */

'use strict';

var grunt = require('../grunt');

var path = require('path');
// nopt模块用来解析命令行参数
var nopt = require('nopt');

// 执行命令行时执行的函数
var cli = module.exports = function(options, done) {
  // 利用传递的参数设置cli.options对象，但是不覆盖命令行的参数
  if (options) {
    Object.keys(options).forEach(function(key) {
      if (!(key in cli.options)) {
        // 如果命令行中不存在这个参数，那么把它加入到cli的options属性中
        cli.options[key] = options[key];
      } else if (cli.optlist[key].type === Array) {
        // 如果命令行中存在这个参数，并且参数的类型是数组，那么把它加入到数组尾部
        [].push.apply(cli.options[key], options[key]);
      }
    });
  }

  // 运行任务
  grunt.tasks(cli.tasks, cli.options, done);
};

// 默认的参数选项列表
var optlist = cli.optlist = {
  help: {
    short: 'h',
    info: 'Display this help text.',
    type: Boolean
  },
  base: {
    info: 'Specify an alternate base path. By default, all file paths are relative to the Gruntfile. ' +
          '(grunt.file.setBase) *',
    type: path
  },
  color: {
    info: 'Disable colored output.',
    type: Boolean,
    negate: true
  },
  gruntfile: {
    info: 'Specify an alternate Gruntfile. By default, grunt looks in the current or parent directories ' +
          'for the nearest Gruntfile.js or Gruntfile.coffee file.',
    type: path
  },
  debug: {
    short: 'd',
    info: 'Enable debugging mode for tasks that support it.',
    type: [Number, Boolean]
  },
  stack: {
    info: 'Print a stack trace when exiting with a warning or fatal error.',
    type: Boolean
  },
  force: {
    short: 'f',
    info: 'A way to force your way past warnings. Want a suggestion? Don\'t use this option, fix your code.',
    type: Boolean
  },
  tasks: {
    info: 'Additional directory paths to scan for task and "extra" files. (grunt.loadTasks) *',
    type: Array
  },
  npm: {
    info: 'Npm-installed grunt plugins to scan for task and "extra" files. (grunt.loadNpmTasks) *',
    type: Array
  },
  write: {
    info: 'Disable writing files (dry run).',
    type: Boolean,
    negate: true
  },
  verbose: {
    short: 'v',
    info: 'Verbose mode. A lot more information output.',
    type: Boolean
  },
  version: {
    short: 'V',
    info: 'Print the grunt version. Combine with --verbose for more info.',
    type: Boolean
  },
  // Even though shell auto-completion is now handled by grunt-cli, leave this
  // option here for display in the --help screen.
  completion: {
    info: 'Output shell auto-completion rules. See the grunt-cli documentation for more information.',
    type: String
  },
};

// 利用optlist列表初始化aliases和known对象
// 传递给nopt模块进行命令行参数解析
var aliases = {};
var known = {};

Object.keys(optlist).forEach(function(key) {
  var short = optlist[key].short;
  if (short) {
    aliases[short] = '--' + key;
  }
  known[key] = optlist[key].type;
});

var parsed = nopt(known, aliases, process.argv, 2);
// 获取命令行中的任务名称
cli.tasks = parsed.argv.remain;
// 获得命令行中的参数
cli.options = parsed;
delete parsed.argv;

// 初始化类型为数组但是还没被初始化的参数，比如npm和task
Object.keys(optlist).forEach(function(key) {
  if (optlist[key].type === Array && !(key in cli.options)) {
    cli.options[key] = [];
  }
});

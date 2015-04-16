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

// 创建util/task.js的对象
var parent = grunt.util.task.create();

// 继承parent对象并且暴露到全局环境中
var task = module.exports = Object.create(parent);

// 用来保存注册的任务信息
var registry = {tasks: [], untasks: [], meta: {}};

// The last specified tasks message.
var lastInfo;

// Number of levels of recursion when loading tasks in collections.
var loadTaskDepth = 0;

// Keep track of the number of log.error() calls.
var errorcount;

// 覆盖parent中的registerTask方法
task.registerTask = function(name) {
  // 将任务加入到registry中
  registry.tasks.push(name);
  // 调用parent的registerTask方法注册任务
  parent.registerTask.apply(task, arguments);
  // 调用parent.registerTask方法之后，任务会被加入到_tasks缓存中
  var thisTask = task._tasks[name];
  // 复制任务的元数据
  thisTask.meta = grunt.util._.clone(registry.meta);
  // 对注册的任务函数进行封装
  // 在真实函数执行之前进行一些预处理
  var _fn = thisTask.fn;
  thisTask.fn = function(arg) {
    // 缓存任务名称
    var name = thisTask.name;
    // Initialize the errorcount for this task.
    errorcount = grunt.fail.errorcount;
    // Return the number of errors logged during this task.
    Object.defineProperty(this, 'errorCount', {
      enumerable: true,
      get: function() {
        return grunt.fail.errorcount - errorcount;
      }
    });
    // 将task.requires方法添加到this对象中
    this.requires = task.requires.bind(task);
    // 将grunt.config.requires方法添加到this对象中
    this.requiresConfig = grunt.config.requires;
    // options方法返回任务的相关option参数，可以通过参数覆盖默认的配置
    this.options = function() {
      var args = [{}].concat(grunt.util.toArray(arguments)).concat([
        grunt.config([name, 'options'])
      ]);
      var options = grunt.util._.extend.apply(null, args);
      grunt.verbose.writeflags(options, 'Options');
      return options;
    };
    // 初始化log输出工作
    var logger = _fn.alias || (thisTask.multi && (!arg || arg === '*')) ? 'verbose' : 'log';
    grunt[logger].header('Running "' + this.nameArgs + '"' +
      (this.name !== this.nameArgs ? ' (' + this.name + ')' : '') + ' task');
    grunt[logger].debug('Task source: ' + thisTask.meta.filepath);
    // 运行真实注册的任务函数
    return _fn.apply(this, arguments);
  };
  return task;
};

// 判断target是否合法，合法的target不能以options命名也不能以'_'开头
function isValidMultiTaskTarget(target) {
  return !/^_|^options$/.test(target);
}

// 对任务的文件路径相关配置进行封装
task.normalizeMultiTaskFiles = function(data, target) {
  var prop, obj;
  var files = [];
  if (grunt.util.kindOf(data) === 'object') {
    if ('src' in data || 'dest' in data) {
      /*
      *Compact Format的情况，比如：
      *'bar' : {
      *  'src' : ['a.js','b.js'] ,
      *  'dest' : 'c.js'
      *}
      */
      obj = {};
      // 将除了options以外的配置复制到obj对象中
      for (prop in data) {
        if (prop !== 'options') {
          obj[prop] = data[prop];
        }
      }
      files.push(obj);
    } else if (grunt.util.kindOf(data.files) === 'object') {
      /*
      *Files Object Format的情况，比如：
      *'bar' : {
      *  'files' : {
      *     'c.js' : ['a.js','b.js']
      *   } 
      *}
      */
      for (prop in data.files) {
        files.push({src: data.files[prop], dest: grunt.config.process(prop)});
      }
    } else if (Array.isArray(data.files)) {
      /*
      *Files Array Format的情况，比如：
      *'bar' : {
      *  'files' : [
      *     {'src':['a.js','b.js'],'dest':'c.js'},
      *     {'src':['a.js','b.js'],'dest':'d.js'}
      *   ]
      *}
      */
      grunt.util._.flatten(data.files).forEach(function(obj) {
        var prop;
        if ('src' in obj || 'dest' in obj) {
          files.push(obj);
        } else {
          for (prop in obj) {
            files.push({src: obj[prop], dest: grunt.config.process(prop)});
          }
        }
      });
    }
  } else {
    /* 
    *Older Format的情况，比如：
    *'bar' : ['a.js','b.js']
    */
    files.push({src: data, dest: grunt.config.process(target)});
  }

  // 如果没找到合法的文件配置对象，那么返回空的文件数组
  if (files.length === 0) {
    grunt.verbose.writeln('File: ' + '[no files]'.yellow);
    return [];
  }

  // 对需要扩展的文件对象进行扩展
  files = grunt.util._(files).chain().forEach(function(obj) {
    // 调整obj.src属性，使其成为一维数组
    // 如果不存在src属性，则直接返回不需要进行任何操作
    if (!('src' in obj) || !obj.src) { return; }
    // 如果obj.src是数组则压缩成一维数组，否则直接转换为数组
    if (Array.isArray(obj.src)) {
      obj.src = grunt.util._.flatten(obj.src);
    } else {
      obj.src = [obj.src];
    }
  }).map(function(obj) {
    // 在obj的基础上创建对象，移除不需要的属性，处理动态生成src到dest的映射
    var expandOptions = grunt.util._.extend({}, obj);
    delete expandOptions.src;
    delete expandOptions.dest;

    // 利用expand中的配置，扩展文件映射关系，并返回扩展后的file对象
    if (obj.expand) {
      return grunt.file.expandMapping(obj.src, obj.dest, expandOptions).map(function(mapObj) {
        // 将obj对象复制为result对象
        var result = grunt.util._.extend({}, obj);
        // 将obj对象复制为result的orig属性
        result.orig = grunt.util._.extend({}, obj);
        // 如果src或dest为模板，则解析为真正的路径
        result.src = grunt.config.process(mapObj.src);
        result.dest = grunt.config.process(mapObj.dest);
        // 移除不需要的属性
        ['expand', 'cwd', 'flatten', 'rename', 'ext'].forEach(function(prop) {
          delete result[prop];
        });
        return result;
      });
    }

    // 复制obj对象，并且向副本添加一个orig属性，属性的值也是obj对象的一个副本
    // 保存一个obj的副本orig是因为在后面可能会对result中的属性进行修改
    // orig使得result中可以访问到原始的file对象
    var result = grunt.util._.extend({}, obj);
    result.orig = grunt.util._.extend({}, obj);

    if ('src' in result) {
      // 如果result对象中具有src属性，那么给src属性添加一个get方法，
      // 方法中对src根据expand进行扩展
      Object.defineProperty(result, 'src', {
        enumerable: true,
        get: function fn() {
          var src;
          if (!('result' in fn)) {
            src = obj.src;
            // 将src转换为数组
            src = Array.isArray(src) ? grunt.util._.flatten(src) : [src];
            // 根据expand参数扩展src属性，并把结果缓存在fn中
            fn.result = grunt.file.expand(expandOptions, src);
          }
          return fn.result;
        }
      });
    }

    if ('dest' in result) {
      result.dest = obj.dest;
    }

    return result;
  }).flatten().value();

  // 如果命令行带有--verbose参数，则在log中输出文件路径
  if (grunt.option('verbose')) {
    files.forEach(function(obj) {
      var output = [];
      if ('src' in obj) {
        output.push(obj.src.length > 0 ? grunt.log.wordlist(obj.src) : '[no src]'.yellow);
      }
      if ('dest' in obj) {
        output.push('-> ' + (obj.dest ? String(obj.dest).cyan : '[no dest]'.yellow));
      }
      if (output.length > 0) {
        grunt.verbose.writeln('Files: ' + output.join(' '));
      }
    });
  }

  return files;
};

// 组成含有多target的task
task.registerMultiTask = function(name, info, fn) {
  // 针对grunt.registerMultiTask('taskName',function(){})的情况
  if (fn == null) {
    fn = info;
    info = 'Custom multi task.';
  }

  var thisTask;
  task.registerTask(name, info, function(target) {
    var name = thisTask.name;
    // 获得除了任务名以外的参数
    this.args = grunt.util.toArray(arguments).slice(1);
    // 如果没有指定target或者指定为*，那么运行所以target
    if (!target || target === '*') {
      return task.runAllTargets(name, this.args);
    } else if (!isValidMultiTaskTarget(target)) {
      // 如果存在不合法的target则抛出错误
      throw new Error('Invalid target "' + target + '" specified.');
    }
    // 判断是否存在对应target的配置
    this.requiresConfig([name, target]);
    // options方法返回任务的相关option参数，可以通过参数覆盖默认的配置
    this.options = function() {
      var targetObj = grunt.config([name, target]);
      var args = [{}].concat(grunt.util.toArray(arguments)).concat([
        grunt.config([name, 'options']),
        grunt.util.kindOf(targetObj) === 'object' ? targetObj.options : {}
      ]);
      var options = grunt.util._.extend.apply(null, args);
      grunt.verbose.writeflags(options, 'Options');
      return options;
    };
    // 将target添加到this对象中
    this.target = target;
    // 为this对象添加flags属性，并且初始化flags对象
    // flags对象用来记录参数列表中是否存在对象的参数
    // 如果存在值为true
    this.flags = {};
    this.args.forEach(function(arg) { this.flags[arg] = true; }, this);
    // 将target的对于配置添加到this对象中
    // 这个配置也就是我们通过initConfig定义的配置
    this.data = grunt.config([name, target]);
    // 将封装之后的files对象添加到this对象中
    this.files = task.normalizeMultiTaskFiles(this.data, target);
    // 将src的相关值添加到this的filesSrc属性中
    Object.defineProperty(this, 'filesSrc', {
      enumerable: true,
      get: function() {
        return grunt.util._(this.files).chain().pluck('src').flatten().uniq().value();
      }.bind(this)
    });
    // 调用任务注册函数，传入相应参数
    return fn.apply(this, this.args);
  });
  // 缓存任务
  thisTask = task._tasks[name];
  // 将任务标记为多任务
  thisTask.multi = true;
};

// grunt中有些任务属于初始化任务
// 也就是说是不需要对其进行相关的配置的
// 如果采用正常的方法注册任务会抛出异常
// 比如grunt中的插件就是初始化任务
task.registerInitTask = function(name, info, fn) {
  task.registerTask(name, info, fn);
  task._tasks[name].init = true;
};

// 覆盖parent中的rename方法
task.renameTask = function(oldname, newname) {
  var result;
  try {
    // 执行parent中的rename方法
    result = parent.renameTask.apply(task, arguments);
    // 更新registry对象
    registry.untasks.push(oldname);
    registry.tasks.push(newname);
    // Return result.
    return result;
  } catch (e) {
    grunt.log.error(e.message);
  }
};

// 运行任务的所有target
task.runAllTargets = function(taskname, args) {
  // 获得任务下面的所有target的名称
  var targets = Object.keys(grunt.config.getRaw(taskname) || {});
  // 过滤掉一些不合法的target
  targets = targets.filter(isValidMultiTaskTarget);
  // 如果没找到合法的target，则返回错误信息
  if (targets.length === 0) {
    grunt.log.error('No "' + taskname + '" targets found.');
    return false;
  }
  // 遍历所有target，分别把它们加入到任务队列中
  targets.forEach(function(target) {
    // 传入的参数为<任务名:target名>
    task.run([taskname, target].concat(args || []).join(':'));
  });
};

// 根据文件路径加载任务
var loadTaskStack = [];
function loadTask(filepath) {
  // 缓存registry对象
  loadTaskStack.push(registry);
  // 重置registry对象
  registry = {tasks: [], untasks: [], meta: {info: lastInfo, filepath: filepath}};
  var filename = path.basename(filepath);
  var msg = 'Loading "' + filename + '" tasks...';
  var regCount = 0;
  var fn;
  try {
    // 加载任务文件
    fn = require(path.resolve(filepath));
    if (typeof fn === 'function') {
      // 运行任务
      fn.call(grunt, grunt);
    }
    //记录任务加载信息
    grunt.verbose.write(msg).ok();
    //记录所有任务的相关信息
    ['un', ''].forEach(function(prefix) {
      var list = grunt.util._.chain(registry[prefix + 'tasks']).uniq().sort().value();
      if (list.length > 0) {
        regCount++;
        grunt.verbose.writeln((prefix ? '- ' : '+ ') + grunt.log.wordlist(list));
      }
    });
    //当没有任务注册时
    if (regCount === 0) {
      grunt.verbose.warn('No tasks were registered or unregistered.');
    }
  } catch (e) {
    grunt.log.write(msg).error().verbose.error(e.stack).or.error(e);
  }
  // 恢复registry对象
  registry = loadTaskStack.pop() || {};
}

// 输出任务信息
function loadTasksMessage(info) {
  // Only keep track of names of top-level loaded tasks and collections,
  // not sub-tasks.
  if (loadTaskDepth === 0) { lastInfo = info; }
  grunt.verbose.subhead('Registering ' + info + ' tasks.');
}

// 加载指定路径下的任务
function loadTasks(tasksdir) {
  try {
    // 找出路径下的所有js和coffee文件
    var files = grunt.file.glob.sync('*.{js,coffee}', {cwd: tasksdir, maxDepth: 1});
    // 依次加载文件中的任务
    files.forEach(function(filename) {
      loadTask(path.join(tasksdir, filename));
    });
  } catch (e) {
    grunt.log.verbose.error(e.stack).or.error(e);
  }
}

// 将loadTasks添加到task对象中
task.loadTasks = function(tasksdir) {
  loadTasksMessage('"' + tasksdir + '"');
  // 如果路径存在则加载任务，否则输出异常信息
  if (grunt.file.exists(tasksdir)) {
    loadTasks(tasksdir);
  } else {
    grunt.log.error('Tasks directory "' + tasksdir + '" not found.');
  }
};

// Load tasks and handlers from a given locally-installed Npm module (installed
// relative to the base dir).
task.loadNpmTasks = function(name) {
  loadTasksMessage('"' + name + '" local Npm module');
  var root = path.resolve('node_modules');
  var pkgfile = path.join(root, name, 'package.json');
  var pkg = grunt.file.exists(pkgfile) ? grunt.file.readJSON(pkgfile) : {keywords: []};

  // Process collection plugins.
  if (pkg.keywords && pkg.keywords.indexOf('gruntcollection') !== -1) {
    loadTaskDepth++;
    Object.keys(pkg.dependencies).forEach(function(depName) {
      // Npm sometimes pulls dependencies out if they're shared, so find
      // upwards if not found locally.
      var filepath = grunt.file.findup('node_modules/' + depName, {
        cwd: path.resolve('node_modules', name),
        nocase: true
      });
      if (filepath) {
        // Load this task plugin recursively.
        task.loadNpmTasks(path.relative(root, filepath));
      }
    });
    loadTaskDepth--;
    return;
  }

  // Process task plugins.
  var tasksdir = path.join(root, name, 'tasks');
  if (grunt.file.exists(tasksdir)) {
    loadTasks(tasksdir);
  } else {
    grunt.log.error('Local Npm module "' + name + '" not found. Is it installed?');
  }
};

// 初始化任务
task.init = function(tasks, options) {
  if (!options) { options = {}; }

  // 拥有init方法说明task是初始化任务
  var allInit = tasks.length > 0 && tasks.every(function(name) {
    var obj = task._taskPlusArgs(name).task;
    return obj && obj.init;
  });

  // 获取gruntfile.js路径，如果有指定路径那么直接使用否则在当前目录及父目录中查找
  var gruntfile, msg;
  if (allInit || options.gruntfile === false) {
    gruntfile = null;
  } else {
    gruntfile = grunt.option('gruntfile') ||
      grunt.file.findup('Gruntfile.{js,coffee}', {nocase: true});
    msg = 'Reading "' + (gruntfile ? path.basename(gruntfile) : '???') + '" Gruntfile...';
  }
  // 如果参数中将gruntfile设为false，那么说明任务是一个插件或者库
  // 不错任何操作
  if (options.gruntfile === false) {
    // Grunt was run as a lib with {gruntfile: false}.
  } else if (gruntfile && grunt.file.exists(gruntfile)) {
    // 如果存在gruntfile
    grunt.verbose.writeln().write(msg).ok();
    // 修改进程的操作目录，如果有指定base那么使用base目录否则就使用gruntfile所在的目录
    process.chdir(grunt.option('base') || path.dirname(gruntfile));
    // 在verbose情况下输出Registering Gruntfile tasks信息
    loadTasksMessage('Gruntfile');
    // 加载gruntfile中的任务
    loadTask(gruntfile);
  } else if (options.help || allInit) {
    // 如果没找到grunt但是有help参数的话，那么不做任何操作
  } else if (grunt.option('gruntfile')) {
    // 如果指定了gruntfile参数但是找不到文件那么输出错误信息
    grunt.log.writeln().write(msg).error();
    grunt.fatal('Unable to find "' + gruntfile + '" Gruntfile.', grunt.fail.code.MISSING_GRUNTFILE);
  } else if (!grunt.option('help')) {
    grunt.verbose.writeln().write(msg).error();
    grunt.log.writelns(
      'A valid Gruntfile could not be found. Please see the getting ' +
      'started guide for more information on how to configure grunt: ' +
      'http://gruntjs.com/getting-started'
    );
    grunt.fatal('Unable to find Gruntfile.', grunt.fail.code.MISSING_GRUNTFILE);
  }

  // 加载用户指定的npm包
  (grunt.option('npm') || []).forEach(task.loadNpmTasks);
  // 加载用户指定的任务
  (grunt.option('tasks') || []).forEach(task.loadTasks);
};

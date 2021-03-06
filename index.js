var vm = require('vm');
var fs = require('fs');
var path = require('path');

var tsc = require.resolve("typescript").replace(/typescript\.js$/, "tsc.js");
var tscScript = vm.createScript(fs.readFileSync(tsc, "utf8"), tsc);
var libPath = path.join(path.dirname(require.resolve("typescript")), "lib.d.ts")

var options = {
  nodeLib: false,
  targetES5: true,
  moduleKind: 'commonjs',
  exitOnError: true,
  dstRoot: null,
  srcRoot: process.cwd
};

module.exports = function(opts) {
  options = merge(options, opts);
};

require.extensions['.ts'] = function(module) {
  var jsname = compileTS(module);
  runJS(jsname, module);
};

function isModified(tsname, jsname) {
  var tsMTime = fs.statSync(tsname).mtime;

  try {
    var jsMTime = fs.statSync(jsname).mtime;
  } catch (e) { //catch if file does not exists
    jsMTime = 0;
  }

  return tsMTime > jsMTime;
}

function findCommonRoot(d1, d2) {
  var c = '';
  d1 = path.resolve(d1)
  d2 = path.resolve(d2)

  var p1 = d1.split(path.sep);
  var p2 = d2.split(path.sep);
  for(var i = 0; i < p1.length; i++) {
    if(p1[i] === p2[i])
      c = c + p1[i] + path.sep;
    else
      break;
  }
  return c;
}

/**
 * Compiles TypeScript file, returns js file path
 * @return {string} js file path
 */
function compileTS (module) {
  var exitCode = 0;
  var srcPath = path.resolve(module.filename)
  var dstRoot = path.resolve(options.dstRoot)
  var commonRoot = findCommonRoot(srcPath, dstRoot)
  var dstPath = path.join(options.dstRoot, path.relative(commonRoot, srcPath.replace(/.ts$/, '.js')))

  if (!isModified(srcPath, dstPath)) {
    return dstPath;
  }

  var argv = [
    "node",
    "tsc.js",
    "--nolib",
    "--target",
    options.targetES5 ? "ES5" : "ES3", !! options.moduleKind ? "--module" : "", !! options.moduleKind ? options.moduleKind : "",
    "--outDir",
    dstRoot,
    libPath,
    options.nodeLib ? path.resolve(__dirname, "typings/node.d.ts") : null,
    srcPath
  ];

  var proc = merge(merge({}, process), {
    argv: compact(argv),
    exit: function(code) {
      if (code !== 0 && options.exitOnError) {
        console.error('Fatal Error. Unable to compile TypeScript file. Exiting.');
        process.exit(code);
      }
      exitCode = code;
    }
  });

  var sandbox = {
    process: proc,
    require: require,
    module: module,
    Buffer: Buffer,
    setTimeout: setTimeout
  };

  tscScript.runInNewContext(sandbox);
  if (exitCode != 0) {
    throw new Error('Unable to compile TypeScript file.');
  }

  return dstPath;
}

function runJS (jsname, module) {
  var content = fs.readFileSync(jsname, 'utf8');

  var sandbox = {};
  for (var k in global) {
    sandbox[k] = global[k];
  }
  sandbox.require = module.require.bind(module);
  sandbox.exports = module.exports;
  sandbox.__filename = jsname;
  sandbox.__dirname = path.dirname(module.filename);
  sandbox.module = module;
  sandbox.global = sandbox;
  sandbox.root = root;

  return vm.runInNewContext(content, sandbox, { filename: jsname });
}

function merge(a, b) {
  if (a && b) {
    for (var key in b) {
      a[key] = b[key];
    }
  }
  return a;
};

function compact(arr) {
  var narr = [];
  arr.forEach(function(data) {
    if (data) narr.push(data);
  });
  return narr;
}

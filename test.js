const TheWatcher = require('./index');

var dir = process.argv[2];
console.log("watching: ", dir);

theWatcher = new TheWatcher(dir);
theWatcher.on('add',    function(f, s)     { show("add   :", f, s    ); });
theWatcher.on('create', function(f, s)     { show("create:", f, s    ); });
theWatcher.on('remove', function(f, s, s2) { show("remove:", f, s, s2); });
theWatcher.on('change', function(f, s)     { show("change:", f, s    ); });

function show(event, f, s, n) {
  console.log(event, f);
}



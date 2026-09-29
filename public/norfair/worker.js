// Runs locally on the visitor's device. Only fixed, bundled code is executed.
let ready;
async function initialize() {
  importScripts('/norfair/runtime/pyodide.js');
  const runtime = await loadPyodide({indexURL:'/norfair/runtime/'});
  await runtime.loadPackage(['numpy','scipy','rich','pygments']);
  for (const name of ['filterpy-1.4.5-py3-none-any.whl','norfair-2.3.0-py3-none-any.whl']) {
    const response = await fetch('/norfair/runtime/'+name);
    if (!response.ok) throw Error('Tracking engine download failed.');
    runtime.unpackArchive(new Uint8Array(await response.arrayBuffer()),'zip',{extractDir:'/lib/python3.12/site-packages'});
  }
  const response = await fetch('/norfair/engine.py');
  if (!response.ok) throw Error('Tracking engine could not load.');
  await runtime.runPythonAsync(await response.text());
  return runtime;
}
let queue = Promise.resolve();
self.onmessage = event => {
  const {id,payload} = event.data;
  queue = queue.then(async () => {
    try {
      const runtime = await (ready ??= initialize());
      if (!payload) {self.postMessage({id,result:[]});return;}
      const fn = runtime.globals.get('process');
      try {self.postMessage({id,result:JSON.parse(fn(JSON.stringify(payload)))});}
      finally {fn.destroy();}
    } catch(error) {self.postMessage({id,error:String(error)});}
  });
};

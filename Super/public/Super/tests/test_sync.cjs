const fs=require('fs'),vm=require('vm'),assert=require('assert');
const code=fs.readFileSync(__dirname+'/../public/firebase-cloud.js','utf8');
const names=['products','inventoryLogs','sales','customers','customerMoves','suppliers','supplierMoves','orders','expenses','cashSessions','cashMovements'];
const store=new Map(),local=new Map();let commits=0;let warnings=[];
const mock={
 doc:(_, ...segments)=>segments.join('/'),
 serverTimestamp:()=>({__serverTimestamp:true}),
 runTransaction:async(_,callback)=>{
   const changes=[];
   const tx={get:async ref=>({exists:()=>store.has(ref),data:()=>store.get(ref)}),set:(ref,obj)=>changes.push({op:'set',ref,obj}),delete:ref=>changes.push({op:'delete',ref})};
   await callback(tx);
   for(const x of changes){if(x.op==='set')store.set(x.ref,x.obj);else store.delete(x.ref)}
   commits++;
 }
};
const empty=()=>Object.fromEntries([['version',1],...names.map(n=>[n,[]])]);
const context={
 window:{addEventListener(){}},document:{addEventListener(){},getElementById:()=>({dataset:{},title:'',textContent:''})},
 localStorage:{setItem(k,v){local.set(k,v)},getItem:k=>local.get(k)||null,removeItem:k=>local.delete(k)},
 navigator:{onLine:true},location:{reload(){}},console:{log(){},warn(){},error(){}},
 setTimeout,clearTimeout,JSON,Number,Error,Date,Map,
 arrayFields:names, db:empty(), DB_KEY:'data-test', EMPTY:empty,validDb:v=>v&&v.version===1&&names.every(n=>Array.isArray(v[n])),
 toast:(msg,isErr)=>warnings.push(msg),render(){},confirm:()=>false
};
vm.createContext(context);vm.runInContext(code,context);
vm.runInContext('cloudUser={uid:"sole-employee"}; cloudReady=true; cloudDb={};cloudSDK=globalMock;cloudBaseline=cloudCopy(db)',Object.assign(context,{globalMock:mock}));
(async()=>{
  vm.runInContext(`db.products.push({id:'p1',name:'Arroz',code:'0001234567890',stock:8,cost:10,price:17});
    db.sales.push({id:'s1',method:'cash',total:34,items:[{productId:'p1',qty:2}],at:'2026-10-07T12:00:00Z'});
    db.cashSessions.push({id:'c1',openedAt:'2026-10-07T12:00:00Z',initial:200,closedAt:null});
    db.cashMovements.push({id:'m1',sessionId:'c1',amount:34,kind:'sale'});`,context);
  await vm.runInContext('cloudFlush()',context);
  assert.equal(store.get('stores/sole-employee/products/p1').code,'0001234567890','Barcode leading zero must remain');
  assert.equal(store.get('stores/sole-employee/sales/s1').total,34);
  assert.equal(store.get('stores/sole-employee/cashMovements/m1').amount,34);
  assert.equal(store.get('stores/sole-employee/meta/state').revision,1);
  assert.equal(commits,1,'single atomic transaction');
  await vm.runInContext('cloudFlush()',context);
  assert.equal(commits,1,'no duplicate sale after retry');
  vm.runInContext(`db.products[0].stock=4;`,context);
  store.set('stores/sole-employee/meta/state',{revision:99});
  await vm.runInContext('cloudFlush()',context);
  assert.equal(store.get('stores/sole-employee/products/p1').stock,8,'no overwrite on conflict');
  assert.equal(vm.runInContext('cloudConflict',context),true,'conflict flagged');
  assert.equal(local.has('slm:firebase:pending:v3'),true,'local pending copy retained');
  assert.ok(warnings.some(x=>x.includes('Conflicto')||x.includes('Cambio')),'warning shown');
  console.log('OK: Firestore mock: cambios atómicos, barras con ceros, venta sin duplicado, conflicto bloquea sobreescritura y conserva respaldo');
  console.log('OK: 4 entidades y transacción de revisión; reintento no duplicó la venta');
})().catch(e=>{console.error(e);process.exit(1)});

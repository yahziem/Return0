/* Firebase backend · Súper La Muñeca, mono-operador.
   Documentos por entidad + transacciones optimistas con control de revisión.
   Los cambios locales sin confirmar se muestran claramente como pendientes.
*/
'use strict';
const CLOUD_DRAFT_KEY='slm:firebase:pending:v3';
const CLOUD_SCOPE_KEY='slm:firebase:scope:v3';
const FIREBASE_SDK_VERSION='12.18.0';
let cloudUser=null, cloudAuth=null, cloudDb=null, cloudSDK=null;
let cloudBaseline=null, cloudRevision=0, cloudReady=false, cloudWorking=false, cloudConflict=false, cloudTimer=null, cloudBooted=false;
let cloudListening=null;
function cloudEnabled(){return true}
function cloudCopy(v){return JSON.parse(JSON.stringify(v))}
function cloudBlank(v){return arrayFields.every(k=>!(v[k]||[]).length)}
function cloudBadge(status){
  const b=document.getElementById('cloudBadge');
  if(!b)return;
  b.dataset.status=status;
  b.textContent=({loading:'◌ Conectando Firebase',saved:'● Guardado en Firebase',saving:'◌ Guardando cambios',offline:'! Guardado solo en este celular',conflict:'! Conflicto · revisar',setup:'! Falta configurar Firebase',locked:'◌ Sin sesión'})[status]||status;
  b.title=status==='saved'?'Cambios confirmados en Firestore':status==='offline'?'Hay cambios sin confirmar en Firebase. Exporta un respaldo antes de cambiar de celular.':'Estado de sincronización';
}
function cloudStatus(status){cloudBadge(status)}
function cloudDiff(oldDb,newDb){
  const changes=[];
  for(const name of arrayFields){
    const old=new Map(oldDb[name].map(item=>[String(item.id),JSON.stringify(item)]));
    const newer=new Map(newDb[name].map(item=>[String(item.id),JSON.stringify(item)]));
    for(const [id,json] of newer)if(old.get(id)!==json)changes.push({name,id,data:JSON.parse(json)});
    for(const id of old.keys())if(!newer.has(id))changes.push({name,id,data:null});
  }
  return changes;
}
function cloudDraft(){
  if(!cloudUser)return;
  try{localStorage.setItem(CLOUD_DRAFT_KEY,JSON.stringify({uid:cloudUser.uid,revision:cloudRevision,db}))}
  catch(e){console.warn('No se pudo guardar el borrador local',e);cloudStatus('offline');toast('No se pudo guardar la copia local. Libera espacio del navegador.',true)}
}
function cloudHasChanges(){return cloudBaseline&&cloudDiff(cloudBaseline,db).length>0}
function cloudSave(){
  if(!cloudUser||!cloudReady||cloudConflict)return;
  cloudDraft();cloudStatus('saving');clearTimeout(cloudTimer);
  cloudTimer=setTimeout(()=>cloudFlush().catch(err=>console.error(err)),350);
}
function cloudCanEdit(act){
  if(!cloudConflict&&cloudReady)return true;
  return ['nav','settings','export','close','product','customer','supplier','order','barcode','print','cloud-retry','logout','resolve-conflict'].includes(act);
}
function cloudResolveConflict(){
  if(!cloudConflict){toast('No hay conflictos que resolver.');return}
  if(!confirm('¡ATENCIÓN! Se descartarán los cambios de este teléfono que NO llegaron a Firebase. Primero descarga un respaldo JSON. ¿Restaurar la última versión de Firebase?'))return;
  localStorage.removeItem(CLOUD_DRAFT_KEY);localStorage.removeItem(DB_KEY);location.reload();
}
function cloudRetry(){
  if(cloudConflict){toast('Hay versiones diferentes. Descarga tu respaldo y vuelve a entrar para resolverlo.',true);return}
  if(!cloudUser){toast('Inicia sesión primero.',true);return}
  if(!cloudReady){cloudLoad().catch(err=>console.error(err));return}
  cloudFlush().catch(err=>console.error(err));
}
function cloudGate(title,text,mode){
  const gate=document.getElementById('authGate');
  gate.hidden=false;document.getElementById('app').hidden=true;
  document.getElementById('authTitle').textContent=title;
  document.getElementById('authText').textContent=text;
  document.getElementById('authForm').hidden=mode!=='login';
  document.getElementById('authRetry').hidden=mode!=='retry';
}
function cloudShowApp(){document.getElementById('authGate').hidden=true;document.getElementById('app').hidden=false}
function cloudFormatError(err){
  const code=String(err?.code||'');
  if(code.includes('auth/invalid-credential')||code.includes('auth/wrong-password')||code.includes('auth/user-not-found'))return 'Correo o contraseña incorrectos.';
  if(code.includes('auth/too-many-requests'))return 'Demasiados intentos. Intenta más tarde.';
  if(code.includes('permission-denied'))return 'Permiso denegado. Revisa las reglas de Firestore y el usuario de Firebase.';
  if(code.includes('unavailable')||!navigator.onLine)return 'Sin conexión a Firebase. Revisa tu internet.';
  return err?.message||'No fue posible conectar con Firebase.';
}
async function cloudInit(){
  if(cloudBooted)return;
  cloudBooted=true;
  cloudGate('Conectando tu tienda','Preparando tu acceso privado…','loading');cloudStatus('loading');
  const config=window.SLM_FIREBASE_CONFIG||{};
  if(!config.apiKey||config.apiKey.includes('PEGA_')||!config.projectId||config.projectId==='TU_PROYECTO'||!config.appId||config.appId.includes('PEGA_')){
    cloudStatus('setup');cloudGate('Activa tu Firebase','Configura public/firebase-config.js con los datos de tu aplicación Firebase y vuelve a publicar. Consulta INSTALACION.md.','setup');return;
  }
  try{
    const root='https://www.gstatic.com/firebasejs/'+FIREBASE_SDK_VERSION+'/';
    const [appSDK,authSDK,fireSDK]=await Promise.all([import(root+'firebase-app.js'),import(root+'firebase-auth.js'),import(root+'firebase-firestore.js')]);
    cloudSDK={...authSDK,...fireSDK};
    const app=appSDK.initializeApp(config);
    cloudAuth=authSDK.getAuth(app);
    // Memoria del SDK: nuestra cola local gestiona pendientes y evita doble aplicación de ventas.
    cloudDb=fireSDK.getFirestore(app);
    authSDK.onAuthStateChanged(cloudAuth,async user=>{
      if(cloudListening){cloudListening();cloudListening=null}
      clearTimeout(cloudTimer);cloudUser=user;cloudReady=false;cloudConflict=false;cloudBaseline=null;
      if(!user){db=EMPTY();cloudStatus('locked');cloudGate('Bienvenido a tu tienda','Ingresa con la única cuenta que creaste en Firebase Authentication.','login');return}
      cloudGate('Cargando tus datos','Comprobando ventas, caja, deudas e inventario…','loading');await cloudLoad();
    });
  }catch(err){console.error('Firebase no pudo iniciar',err);cloudStatus('offline');cloudGate('No fue posible cargar Firebase',cloudFormatError(err),'retry')}
}
async function cloudLogin(){
  if(!cloudAuth)return;
  const email=document.getElementById('authEmail').value.trim();const password=document.getElementById('authPassword').value;
  const msg=document.getElementById('authError');msg.textContent='Ingresando…';
  try{await cloudSDK.signInWithEmailAndPassword(cloudAuth,email,password);msg.textContent=''}
  catch(err){console.error('Acceso rechazado',err?.code);msg.textContent=cloudFormatError(err)}
}
async function cloudLogout(){
  if(!confirm('¿Cerrar sesión en este celular? Asegúrate de que el indicador diga «Guardado en Firebase».'))return;
  if(cloudHasChanges()||cloudWorking){toast('Primero sincroniza todos los movimientos o descarga un respaldo.',true);return}
  try{await cloudSDK.signOut(cloudAuth)}catch(err){toast(cloudFormatError(err),true)}
}
async function cloudRead(){
  const base=cloudSDK.doc(cloudDb,'stores',cloudUser.uid,'meta','state');
  const meta=await cloudSDK.getDocFromServer(base);
  const values=await Promise.all(arrayFields.map(async name=>{
    const q=await cloudSDK.getDocsFromServer(cloudSDK.collection(cloudDb,'stores',cloudUser.uid,name));
    return [name,q.docs.map(x=>x.data())];
  }));
  const next=EMPTY();for(const [name,items] of values)next[name]=items;
  return {revision:meta.exists()?Number(meta.data().revision)||0:0,db:next};
}
async function cloudLoad(){
  if(!cloudUser)return;
  if(cloudListening){cloudListening();cloudListening=null}
  cloudStatus('loading');
  const uid=cloudUser.uid;
  const scope=localStorage.getItem(CLOUD_SCOPE_KEY);
  if(scope!==uid){localStorage.removeItem(DB_KEY);localStorage.removeItem(CLOUD_DRAFT_KEY)}
  localStorage.setItem(CLOUD_SCOPE_KEY,uid);
  let pending=null;
  try{pending=JSON.parse(localStorage.getItem(CLOUD_DRAFT_KEY)||'null');if(pending?.uid!==uid||!validDb(pending?.db))pending=null}catch(_){pending=null}
  try{
    const remote=await cloudRead();
    if(!cloudUser||cloudUser.uid!==uid)return;
    cloudRevision=remote.revision;cloudBaseline=cloudCopy(remote.db);cloudReady=true;
    if(pending&&cloudDiff(remote.db,pending.db).length){
      if(Number(pending.revision)!==cloudRevision){
        cloudConflict=true;db=pending.db;localStorage.setItem(DB_KEY,JSON.stringify(db));cloudShowApp();render();cloudStatus('conflict');
        toast('Cambios locales y remotos distintos. Descarga un respaldo para conciliarlos.',true);return;
      }
      db=pending.db;cloudShowApp();render();cloudStatus('offline');cloudFlush();return;
    }
    db=remote.db;
    localStorage.setItem(DB_KEY,JSON.stringify(db));localStorage.removeItem(CLOUD_DRAFT_KEY);
    cloudShowApp();render();cloudStatus('saved');
    cloudListening=cloudSDK.onSnapshot(cloudSDK.doc(cloudDb,'stores',uid,'meta','state'),snap=>{
      if(!cloudReady||cloudWorking||cloudConflict||snap.metadata.hasPendingWrites)return;
      const latest=snap.exists()?Number(snap.data().revision)||0:0;
      if(latest>cloudRevision){
        if(cloudHasChanges()){
          cloudConflict=true;cloudDraft();cloudStatus('conflict');toast('Cambios hechos desde otra pestaña. Descarga respaldo antes de recargar.',true);
        }else{
          cloudReady=false;cloudLoad().catch(err=>console.error(err));
        }
      }
    },err=>console.warn('Suscripción',err));
  }catch(err){
    console.error('Lectura Firebase',err);
    cloudGate('No se pudieron cargar los datos',cloudFormatError(err)+' Tus movimientos locales pendientes no se borraron. Reintenta con internet antes de vender.','retry');cloudStatus('offline');
  }
}
async function cloudFlush(){
  if(!cloudUser||!cloudReady||cloudWorking||cloudConflict||!cloudBaseline)return;
  if(!navigator.onLine){cloudDraft();cloudStatus('offline');return}
  cloudWorking=true;cloudStatus('saving');
  try{
    let batches=0;
    while(true){
      const delta=cloudDiff(cloudBaseline,db);
      if(!delta.length)break;
      // Cada operación altera solo 1 documento; +1 metadato por transacción.
      const block=delta.slice(0,170),baseRevision=cloudRevision,uid=cloudUser.uid;
      const metaRef=cloudSDK.doc(cloudDb,'stores',uid,'meta','state');
      await cloudSDK.runTransaction(cloudDb,async tx=>{
        const snap=await tx.get(metaRef);
        const remoteRevision=snap.exists()?Number(snap.data().revision)||0:0;
        if(remoteRevision!==baseRevision)throw Error('CONFLICTO_REVISION: cambios desde otra pestaña');
        for(const change of block){
          const ref=cloudSDK.doc(cloudDb,'stores',uid,change.name,change.id);
          if(change.data===null)tx.delete(ref);
          else tx.set(ref,change.data);
        }
        tx.set(metaRef,{revision:baseRevision+1,updatedAt:cloudSDK.serverTimestamp()});
      });
      cloudRevision++;
      for(const item of block){
        const arr=cloudBaseline[item.name];const i=arr.findIndex(x=>x.id===item.id);
        if(item.data===null){if(i>=0)arr.splice(i,1)}
        else if(i>=0)arr[i]=cloudCopy(item.data);else arr.push(cloudCopy(item.data));
      }
      cloudDraft();if(++batches>500)throw Error('Demasiados cambios. Contacta soporte para importar por partes.');
    }
    localStorage.removeItem(CLOUD_DRAFT_KEY);cloudStatus('saved');
  }catch(err){
    console.error('Sincronización Firebase',err);
    if(/CONFLICTO_REVISION/.test(String(err))){cloudConflict=true;cloudStatus('conflict');toast('Cambio en otra pestaña. Exporta respaldo y vuelve a entrar.',true)}
    else {cloudStatus('offline');toast('Hay cambios pendientes de guardar en Firebase. Usa el respaldo como seguridad.',true)}
    cloudDraft();
  }finally{cloudWorking=false}
}
window.addEventListener('online',()=>{if(cloudUser){if(!cloudReady)cloudLoad();else cloudRetry()}});
document.addEventListener('submit',e=>{if(e.target.id==='authForm'){e.preventDefault();cloudLogin()}});
document.addEventListener('click',e=>{if(e.target.id==='authRetry')location.reload();if(e.target.closest('#cloudBadge'))cloudRetry()});

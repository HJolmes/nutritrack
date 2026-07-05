// NutriTrack – Foto-Speicher in IndexedDB (window.NTPhotos)
// Mahlzeit-Fotos (Base64-JPEGs, mehrere 100 KB) liegen hier statt im
// localStorage-State nt_v6 (~5 MB Limit). put(id,dataUrl) / get(id)→Promise /
// del(id) / ok(). Klassisches Script, kein Modul.
(function(){
  var DBN='nt-photos',STORE='photos',_db=null;
  function open(){
    if(_db)return Promise.resolve(_db);
    return new Promise(function(res,rej){
      var rq=indexedDB.open(DBN,1);
      rq.onupgradeneeded=function(){rq.result.createObjectStore(STORE);};
      rq.onsuccess=function(){_db=rq.result;res(_db);};
      rq.onerror=function(){rej(rq.error);};
    });
  }
  function tx(mode,fn){
    return open().then(function(db){
      return new Promise(function(res,rej){
        var t=db.transaction(STORE,mode),s=t.objectStore(STORE),out=fn(s);
        t.oncomplete=function(){res(out&&out.result!==undefined?out.result:undefined);};
        t.onerror=function(){rej(t.error);};
      });
    });
  }
  window.NTPhotos={
    put:function(id,dataUrl){return tx('readwrite',function(s){s.put(dataUrl,id);});},
    get:function(id){var r;return tx('readonly',function(s){r=s.get(id);return r;}).then(function(){return r.result||null;});},
    del:function(id){return tx('readwrite',function(s){s.delete(id);});},
    ok:function(){return !!window.indexedDB;}
  };
})();

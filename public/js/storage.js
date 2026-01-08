const DB_NAME = 'runway_db';
const STORE_NAME = 'state';
const DB_VERSION = 1;
const ROOT_KEY = 'app_root';

let dbInstance = null;

//Internals

const openDB = () => {
    return new Promise((resolve, reject) => {
        if (dbInstance) return resolve(dbInstance);

        if (!window.indexedDB) {
            return reject(new Error('IndexedDB not supported in this environment'));
        }

        const request = window.indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = (event) => {
            console.error('IndexedDB: Connection failed', event.target.error);
            reject(event.target.error);
        };

        request.onsuccess = (event) => {
            dbInstance = event.target.result;
            resolve(dbInstance);
        };

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
    });
};

const performTransaction = (mode, callback) => {
    return openDB()
        .then(db => {
            return new Promise((resolve, reject) => {
                try {
                    const tx = db.transaction([STORE_NAME], mode);
                    const store = tx.objectStore(STORE_NAME);
                    
                    tx.onerror = (e) => {
                        console.error(`IndexedDB: Transaction failed (${mode})`, e.target.error);
                        reject(e.target.error);
                    };

                    const request = callback(store);

                    request.onsuccess = () => resolve(request.result);
                    request.onerror = (e) => reject(e.target.error);
                } catch (err) {
                    console.error('IndexedDB: Synchronous error', err);
                    reject(err);
                }
            });
        });
};

// API 

const saveState = (state) => {
    return performTransaction('readwrite', (store) => {
        return store.put(state, ROOT_KEY);
    });
};

const loadState = () => {
    return performTransaction('readonly', (store) => {
        return store.get(ROOT_KEY);
    });
};

const clearState = () => {
    return performTransaction('readwrite', (store) => {
        return store.delete(ROOT_KEY);
    });
};

export {
    saveState,
    loadState,
    clearState
};
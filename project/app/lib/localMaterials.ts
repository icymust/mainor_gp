import { Material } from "./materials";

const DB_NAME = "mainor-share";
const DB_VERSION = 1;
const MATERIAL_STORE = "materials";
const FILE_STORE = "files";

type LocalMaterial = Omit<Material, "createdAt" | "searchText"> & {
  createdAtMs: number;
  searchText: string;
};

function openLocalDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(MATERIAL_STORE)) {
        db.createObjectStore(MATERIAL_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(FILE_STORE)) {
        db.createObjectStore(FILE_STORE, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed."));
  });
}

function runStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
) {
  return openLocalDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(storeName, mode);
        const request = action(transaction.objectStore(storeName));

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
        transaction.oncomplete = () => db.close();
        transaction.onerror = () => {
          db.close();
          reject(transaction.error ?? new Error("IndexedDB transaction failed."));
        };
      }),
  );
}

export async function saveLocalMaterial(material: LocalMaterial, file: File) {
  const db = await openLocalDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction([MATERIAL_STORE, FILE_STORE], "readwrite");
    transaction.objectStore(MATERIAL_STORE).put(material);
    transaction.objectStore(FILE_STORE).put({ id: material.id, file });
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error ?? new Error("Local save failed."));
    };
  });
}

export async function getLocalMaterials(ownerId?: string) {
  const records = await runStore<LocalMaterial[]>(MATERIAL_STORE, "readonly", (store) =>
    store.getAll(),
  );

  return records
    .filter((item) => !ownerId || item.ownerId === ownerId)
    .sort((a, b) => b.createdAtMs - a.createdAtMs)
    .map(
      (item): Material => ({
        ...item,
        storageProvider: "local",
        createdAt: undefined,
      }),
    );
}

export async function downloadLocalMaterial(material: Material) {
  const record = await runStore<{ id: string; file: File } | undefined>(
    FILE_STORE,
    "readonly",
    (store) => store.get(material.id),
  );
  if (!record?.file) throw new Error("Local file was not found in this browser.");

  const url = URL.createObjectURL(record.file);
  const link = document.createElement("a");
  link.href = url;
  link.download = material.fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function deleteLocalMaterial(id: string) {
  const db = await openLocalDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction([MATERIAL_STORE, FILE_STORE], "readwrite");
    transaction.objectStore(MATERIAL_STORE).delete(id);
    transaction.objectStore(FILE_STORE).delete(id);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error ?? new Error("Local delete failed."));
    };
  });
}

export function localMaterialId() {
  return `local_${crypto.randomUUID()}`;
}

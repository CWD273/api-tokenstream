const store = new Map();

export const get = (key) => store.get(key);

export const set = (key, value) => {
  store.set(key, value);
  return store.get(key);
};

export const remove = (key) => store.delete(key);

export const upsert = (key, updater) => {
  const current = store.get(key);
  const next = updater(current || {});
  store.set(key, next);
  return next;
};

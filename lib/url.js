export const isAbsolute = (u) => /^https?:\/\//i.test(u);

export const joinUrl = (base, relative) => {
  try {
    return new URL(relative, base).toString();
  } catch {
    return relative; // fallback
  }
};

export const stripQuery = (u) => {
  try {
    const url = new URL(u);
    url.search = "";
    return url.toString();
  } catch {
    return u;
  }
};

export const ensureHttpsIfNeeded = (u) => u; // keep original scheme (some sources reject https)

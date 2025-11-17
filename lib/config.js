export const channels = {
  "cartoon-network": {
    bootstrapUrl: "http://206.212.244.71:8080/live/Abxc5k/363887/46708.m3u8",
    preferredVariant: "highest"
  }
};
export const defaultTokenTtlMs = 4 * 60 * 1000;
export const refreshJitterMs = 300;
export const retryDelaysMs = [250, 500, 1000];
export const defaultLogEndpoint = "https://servicename.vercel.app/api/log";

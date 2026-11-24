(() => {
  const secureUrl = value => {
    try {
      if (typeof value !== "string" || value.length > 1600 || /[\s<>\\]/.test(value)) return "";
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password &&
        /\.[a-z][a-z\d-]{1,62}$/i.test(url.hostname) ? url.href : "";
    } catch { return ""; }
  };
  function pairCode(code) {
    const text = String(code || "").trim();
    if (!/^[a-z\d_-]{70,500}$/i.test(text)) return null;
    try {
      const decoded = JSON.parse(atob(text.replace(/-/g,"+").replace(/_/g,"/")));
      const url = secureUrl(decoded.url);
      if (!url || new URL(url).origin + "/" !== url || !/^[a-z\d_-]{43}$/i.test(decoded.token)) return null;
      return {url:new URL(url).origin,token:decoded.token};
    } catch { return null; }
  }
  async function request(pair,path,input) {
    const headers = {Authorization:"Bearer "+pair.token};
    if (input) headers["Content-Type"] = "application/json";
    const response = await fetch(pair.url+path,{
      method:input ? "POST" : "GET", headers,
      body:input ? JSON.stringify(input) : undefined,
      credentials:"omit", cache:"no-store", redirect:"error",
      signal:AbortSignal.timeout(path === "/search" ? 110000 : 9500)
    });
    if (!response.ok) throw new Error(response.status === 401 ? "pair" : response.status === 429 ? "busy" : "connection");
    return path === "/bottle" ? response.blob() : response.json();
  }
  globalThis.PerfumeCodex = {pairCode,request,secureUrl};
})();

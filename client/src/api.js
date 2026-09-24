import axios from 'axios';
export const api=axios.create({baseURL:import.meta.env.VITE_API_BASE_URL||'/api',withCredentials:true,timeout:20000});
api.interceptors.response.use(x=>x, async err => {
  let data = err.response?.data;
  if (data instanceof Blob) {
    try { data = JSON.parse(await data.text()); } catch { data = null; }
  }
  throw Object.assign(new Error(data?.error || err.message || 'Request failed'), { status: err.response?.status });
});
export const getToken=()=>sessionStorage.getItem('shree_draft')||'';
export const setToken=t=>t?sessionStorage.setItem('shree_draft',t):sessionStorage.removeItem('shree_draft');
export const draftHeaders=()=>({Authorization:`Bearer ${getToken()}`});
export function downloadBlob(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);}
export const img=(name)=>`/images/${name}`;

import axios from 'axios';

const isProd = import.meta.env.PROD;
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

export const api = axios.create({
    baseURL: API_BASE_URL,
    headers: { 'Content-Type': 'application/json' }
});

// Attach JWT session token to every request
api.interceptors.request.use((config) => {
    const token = sessionStorage.getItem('smartqx_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Auto-logout on 401
api.interceptors.response.use(
    (res) => res,
    (err) => {
        if (err.response?.status === 401 && window.location.pathname !== '/login') {
            sessionStorage.removeItem('smartqx_token');
            sessionStorage.removeItem('smartqx_user');
            window.location.href = '/login';
        }
        return Promise.reject(err);
    }
);

export function getWebSocketURL() {
    if (isProd) {
        const base = import.meta.env.VITE_API_BASE_URL;
        if (base) return base.replace(/^http/, 'ws') + '/ws';
    }
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    return `${protocol}://${window.location.host}/api/ws`;
}

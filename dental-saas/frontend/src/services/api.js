import axios from "axios";

let _accessToken = "";
let _csrfToken = "";

export const setAccessToken = (token) => {
    _accessToken = token;
};

export const setCsrfToken = (token) => {
    _csrfToken = token;
};

export const getAccessToken = () => {
    return _accessToken;
};

const api = axios.create({
    baseURL: "/api",
    headers: { "Content-Type": "application/json" },
    withCredentials: true, // Critical for sending refresh cookie
});

/* ── Request: attach Bearer token & CSRF ───────────────── */
api.interceptors.request.use((config) => {
    if (_accessToken) {
        config.headers.Authorization = `Bearer ${_accessToken}`;
    }
    if (_csrfToken) {
        config.headers["x-csrf-token"] = _csrfToken;
    }
    return config;
});

/* ── Response: auto-refresh on 401 ─────────────────────── */
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
    failedQueue.forEach((prom) => {
        if (error) {
            prom.reject(error);
        } else {
            prom.resolve(token);
        }
    });
    failedQueue = [];
};

api.interceptors.response.use(
    (res) => res,
    async (err) => {
        const originalRequest = err.config;

        // 401 error and request has not been retried yet
        if (err.response?.status === 401 && !originalRequest._retry) {

            // If already refreshing, queue this request
            if (isRefreshing) {
                return new Promise((resolve, reject) => {
                    failedQueue.push({ resolve, reject });
                })
                    .then((token) => {
                        originalRequest.headers.Authorization = `Bearer ${token}`;
                        return api(originalRequest);
                    })
                    .catch((err) => Promise.reject(err));
            }

            // Flag as retry to prevent infinite loops (Dual Token Hardening Rule 2)
            originalRequest._retry = true;
            isRefreshing = true;

            try {
                // Dual Token Hardening Rule 3/4: Restricted path refresh
                const res = await axios.post("/api/auth/refresh", {}, {
                    withCredentials: true,
                    headers: { "x-csrf-token": _csrfToken } // CSRF Rule: Must include header
                });
                const { token, csrfToken } = res.data;

                setAccessToken(token);
                setCsrfToken(csrfToken); // Update CSRF token on rotation
                processQueue(null, token);

                originalRequest.headers.Authorization = `Bearer ${token}`;
                originalRequest.headers["x-csrf-token"] = csrfToken; // Update local request header too
                return api(originalRequest);
            } catch (refreshError) {
                processQueue(refreshError, null);
                // Clear state on failure
                _accessToken = "";
                // Dispatch event for AuthContext to handle redirect to login
                window.dispatchEvent(new Event("auth-session-expired"));
                return Promise.reject(refreshError);
            } finally {
                isRefreshing = false;
            }
        }
        return Promise.reject(err);
    }
);

export default api;

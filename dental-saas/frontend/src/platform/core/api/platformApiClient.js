/**
 * platformApiClient.js
 * v19.3 — Generated API Client Singleton for the Platform Plane
 *
 * Creates the typed `Api` client from the OpenAPI spec and wires its
 * underlying axios instance to `platformApi` so that:
 *
 *   - All existing interceptors (token injection, 401 retry) are inherited
 *   - withCredentials: true is preserved (set on platformApi already)
 *   - baseURL is preserved (/api/platform)
 *   - No duplicate interceptor registration required
 *
 * Usage:
 *   import { platformApiClient } from "@/platform/core/api/platformApiClient";
 *   const { data } = await platformApiClient.auth.loginCreate({ email, password });
 *
 * DO NOT instantiate Api() elsewhere — use this singleton only.
 */
import { Api } from "./generated/Api";
import platformApi from "../../auth/platformApi";

// Create the typed client — baseURL and withCredentials are set on platformApi.
const platformApiClient = new Api();

// Wire the generated client's axios instance to platformApi so it
// inherits all interceptors (token injection, 401 retry) transparently.
// This is the canonical pattern for integrating swagger-typescript-api
// with an existing interceptor-equipped axios instance.
platformApiClient.instance = platformApi;

export { platformApiClient };

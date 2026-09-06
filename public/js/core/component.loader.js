/**
 * component.loader.js — Dynamic component template loader and dynamic script loader.
 */

class ComponentLoaderClass {
    constructor() {
        this.componentCache = {};
        this.activeRequests = {};
        this.loadedScripts = new Set();
    }

    /**
     * Loads a component's rendered HTML from the server.
     * @param {string} name - Name of the component (e.g., 'dashboard', 'chat/layout')
     * @param {boolean} [force=false] - If true, bypasses cache and triggers a reload
     * @returns {Promise<string>} The rendered HTML string
     */
    async load(name, force = false) {
        if (!force && this.componentCache[name]) {
            return this.componentCache[name];
        }

        if (this.activeRequests[name]) {
            return this.activeRequests[name];
        }

        const promise = (async () => {
            try {
                const versionTag = window.APP_VERSION || "1.0.0";
                const response = await apiRequest("GET", `/api/components/${name}?v=${versionTag}`, null, "text");
                if (!response.ok) {
                    throw new Error(`Component fetch failed with status ${response.status}`);
                }
                const html = response.data
                this.componentCache[name] = html;
                return html;
            } catch (err) {
                console.error(`[ComponentLoader] Failed to load component "${name}":`, err);
                throw err;
            }
        })();

        this.activeRequests[name] = promise;
        try {
            return await promise;
        } finally {
            delete this.activeRequests[name];
        }
    }

    /**
     * Loads a standard client-side JavaScript file dynamically.
     * @param {string} src - The script source path
     * @returns {Promise<void>} Resolves when the script has loaded successfully
     */
    loadScript(src) {
        return new Promise((resolve, reject) => {
            const versionTag = window.APP_VERSION || "1.0.0";
            const cacheBusterSrc = src.includes("?") ? src : `${src}?v=${versionTag}`;
            // Check if already loaded
            if (this.loadedScripts.has(src) || document.querySelector(`script[src^="${src}"]`)) {
                this.loadedScripts.add(src);
                resolve();
                return;
            }

            const script = document.createElement("script");
            script.src = cacheBusterSrc;
            script.async = true;

            script.onload = () => {
                this.loadedScripts.add(src);
                resolve();
            };

            script.onerror = (err) => {
                console.error(`[ComponentLoader] Failed to load script "${src}":`, err);
                reject(err);
            };

            document.body.appendChild(script);
        });
    }

    /**
     * Loads a stylesheet dynamically.
     * @param {string} href - The stylesheet href path
     */
    loadStyle(href) {
        if (document.querySelector(`link[href^="${href}"]`)) {
            return;
        }
        const versionTag = window.APP_VERSION || "1.0.0";
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = href.includes("?") ? href : `${href}?v=${versionTag}`;
        document.head.appendChild(link);
    }
}

window.ComponentLoader = new ComponentLoaderClass();

export class ServiceWorker {
    url: string
    fallback = false
    justinstall = false
    sw = navigator.serviceWorker ? navigator.serviceWorker.controller : null
    constructor(_url: string | URL, _fallback: string | URL) {
        const url: URL = new URL(_url, location.href)
        const fallback = new URL(_fallback, location.href)
        if (url.origin !== location.origin) {
            const urlHash = (url.href.match(/\.(.*?).js$/) || [])[1]
            if (urlHash) {
                fallback.searchParams.set('id', urlHash)
            }
            this.url = fallback.href
            this.fallback = true
        } else {
            this.url = url.href
        }
    }
    async install() {
        // if fallback, check file exists
        if (this.fallback) {
            try {
                const response = await fetch(this.url)
                if (response.status !== 200) {
                    throw new Error(`${response.status} ${response.statusText}`)
                }
            } catch (e) {
                return
            }
        }
        // check support
        if (!('serviceWorker' in navigator)) {
            return
        }
        // check if already installed and is the same version
        if (navigator.serviceWorker.controller) {
            const current = navigator.serviceWorker.controller
            if (current.scriptURL === this.url) {
                return
            }
        }
        // register
        navigator.serviceWorker
            .register(this.url, {
                scope: '/',
            })
            .then(async (registration) => {
                // wait for install
                await navigator.serviceWorker.ready
                console.log('[cocogoat-sw] ServiceWorker installed', registration)
                this.justinstall = true
            })
    }

    async uninstall() {
        const r = await navigator.serviceWorker.getRegistrations()
        for (const registration of r) {
            await registration.unregister()
        }
    }

    async addInstallListener() {
        if (!navigator.serviceWorker || !this.sw) {
            return
        }
        window.addEventListener('onappinstalled', () => {
            console.log('[cocogoat-sw] installed to app')
            this.cacheAll()
        })
    }
    async cacheAll(onprogress?: (loaded: number, total: number) => unknown) {
        if (!navigator.serviceWorker || !this.sw) {
            throw new Error('ServiceWorker not installed')
        }
        if (!window.$cocogoat.manifest) {
            throw new Error('Manifest not loaded')
        }
        // fetch manifest
        const publicPath = new URL(__webpack_public_path__, location.href)
        const manifestUrl = new URL(window.$cocogoat.manifest, publicPath)
        const manifestReq = await fetch(manifestUrl.toString())
        if (manifestReq.status !== 200) {
            throw new Error(`${manifestReq.status} ${manifestReq.statusText}`)
        }
        const manifest = (await manifestReq.json()) as string[]
        manifest.push(new URL('/', location.href).toString())
        // fetch all files
        let loaded = 0
        const promises = manifest.map((url) => {
            const urlObj = new URL(url, publicPath)
            return fetch(urlObj.toString())
                .then((res) => {
                    if (res.status !== 200) {
                        throw new Error(`${res.status} ${res.statusText}`)
                    }
                    return res.blob()
                })
                .then(() => {
                    loaded++
                    if (onprogress) onprogress(loaded, manifest.length)
                    console.log('[cocogoat-sw] precache', loaded + '/' + manifest.length)
                })
        })
        await Promise.all(promises)
    }
}

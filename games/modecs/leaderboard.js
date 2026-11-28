// These are public project settings, intended to ship with the browser game.
(function () {
    const url = "https://gtdpxlxjpbhsjappnpbq.supabase.co";
    const publishableKey = "sb_publishable_AXoI8vzII26vapPHRBPMFA_A6dXRIN0";
    const sessionKey = "modecs.supabaseSession";
    let session = null;
    try { session = JSON.parse(localStorage.getItem(sessionKey)); } catch (_) {}
    if (!session?.access_token || !session?.refresh_token || !session?.user?.id) session = null;
    let authTask = null;
    let rows = [];
    let status = 0; // Idle, Loading, Ready, Unavailable, SetupRequired (see leaderboard.odin).
    let submissionStatus = 0; // Idle, Saving, Saved, Failed, SetupRequired.
    let runNumber = 0;

    async function request(path, options = {}, accessToken) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        try {
            const headers = { apikey: publishableKey, "Content-Type": "application/json" };
            if (accessToken) headers.Authorization = "Bearer " + accessToken;
            const response = await fetch(url + path, { ...options, headers, signal: controller.signal });
            const text = await response.text();
            let data = null;
            try { data = text ? JSON.parse(text) : null; } catch (_) {}
            if (!response.ok) {
                const error = new Error(data?.message || data?.msg || "Leaderboard request failed");
                error.status = response.status;
                error.code = data?.code || data?.error_code;
                throw error;
            }
            return data;
        } finally { clearTimeout(timeout); }
    }

    function rememberSession(data) {
        if (!data?.access_token || !data?.refresh_token || !data?.user?.id) throw new Error("Invalid player session");
        session = {
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            expires_at: data.expires_at || Math.floor(Date.now() / 1000) + data.expires_in,
            user: { id: data.user.id }
        };
        try { localStorage.setItem(sessionKey, JSON.stringify(session)); } catch (_) {}
        return session;
    }

    async function getSession(forceRefresh = false) {
        if (!forceRefresh && session?.expires_at > Date.now() / 1000 + 60) return session;
        if (!authTask) {
            authTask = (async function () {
                if (session?.refresh_token) {
                    try {
                        return rememberSession(await request("/auth/v1/token?grant_type=refresh_token", {
                            method: "POST", body: JSON.stringify({ refresh_token: session.refresh_token })
                        }));
                    } catch (error) {
                        // Network failures keep the identity so a later attempt can refresh it.
                        if (error.status !== 400 && error.status !== 401) throw error;
                        session = null;
                        try { localStorage.removeItem(sessionKey); } catch (_) {}
                    }
                }
                return rememberSession(await request("/auth/v1/signup", {
                    method: "POST", body: JSON.stringify({ data: {} })
                }));
            })();
        }
        try { return await authTask; }
        finally { authTask = null; }
    }

    function needsSetup(error) {
        return error.code === "anonymous_provider_disabled" || error.code === "PGRST205" ||
            error.code === "PGRST202" || error.code === "42501" || error.status === 401;
    }

    function validName(name) {
        return typeof name === "string" && name.length >= 1 && name.length <= 20 &&
            name === name.trim() && /^[A-Za-z0-9 _-]+$/.test(name);
    }

    async function load() {
        if (status === 1) return;
        status = 1;
        rows = [];
        try {
            const result = await request("/rest/v1/leaderboard?select=player_name,score,survived_seconds&order=score.desc,survived_seconds.desc,player_name.asc&limit=10");
            if (!Array.isArray(result)) throw new Error("Invalid leaderboard response");
            rows = result.filter(row => validName(row.player_name) && Number.isInteger(row.score) && row.score >= 0 &&
                Number.isInteger(row.survived_seconds) && row.survived_seconds >= 0).slice(0, 10);
            status = 2;
        } catch (error) {
            status = needsSetup(error) ? 4 : 3;
        }
    }

    async function submit(name, score, seconds) {
        const thisRun = runNumber;
        submissionStatus = 1;
        try {
            if (!validName(name) || !Number.isInteger(score) || score < 0 || !Number.isInteger(seconds) || seconds < 0) {
                throw new Error("Invalid run result");
            }
            const body = JSON.stringify({ p_player_name: name, p_score: score, p_survived_seconds: seconds });
            let player = await getSession();
            try {
                await request("/rest/v1/rpc/submit_score", { method: "POST", body }, player.access_token);
            } catch (error) {
                if (error.status !== 401) throw error;
                player = await getSession(true);
                await request("/rest/v1/rpc/submit_score", { method: "POST", body }, player.access_token);
            }
            if (thisRun === runNumber) submissionStatus = 2;
            return true;
        } catch (error) {
            if (thisRun === runNumber) submissionStatus = needsSetup(error) ? 4 : 3;
            return false;
        }
    }

    window.modecsLeaderboard = {
        load, submit,
        beginRun() { runNumber++; submissionStatus = 0; },
        get rows() { return rows; },
        get status() { return status; },
        get submissionStatus() { return submissionStatus; }
    };
})();

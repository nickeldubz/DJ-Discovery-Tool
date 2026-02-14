document.addEventListener('DOMContentLoaded', () => {
    console.log("NAME DROP | Stealth Discovery Crate Active");

    // --- API CREDENTIALS ---
    const LASTFM_KEY = "533281fde87701480cd27a936bcaef0b";
    const SC_CLIENT_ID = "cES7wr3PiVoJHfpPvtmpDLnx9NjRzMha";

    // --- UI ELEMENTS ---
    const seedArtistInput = document.getElementById('seedArtistInput');
    const discoverBtn = document.getElementById('discoverBtn');
    const discoveredTracksGrid = document.getElementById('discoveredTracksGrid');
    const pinnedTracksGrid = document.getElementById('pinnedTracksGrid');
    const loadingDiv = document.getElementById('loading');
    const errorDiv = document.getElementById('error');

    const STORAGE_KEY = 'namedrop_pinned_crate';
    let pinnedTracks = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];

    // --- UTILITIES ---
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // --- STEALTH FETCH WITH PROXY ROTATION ---
    async function fetchWithStealth(scUrl, retries = 2) {
        // We rotate proxies to dodge IP-based rate limiting
        const proxies = [
            { url: "https://proxy.cors.sh/", type: "cors-sh" },
            { url: "https://api.allorigins.win/get?url=", type: "allorigins" }
        ];
        
        const currentProxy = proxies[retries % proxies.length];
        const isAllOrigins = currentProxy.type === "allorigins";
        const finalUrl = isAllOrigins 
            ? `${currentProxy.url}${encodeURIComponent(scUrl)}` 
            : `${currentProxy.url}${scUrl}`;

        try {
            console.log(`Attempting dig via ${currentProxy.type}...`);
            
            const response = await fetch(finalUrl, {
                headers: isAllOrigins ? {} : { 'x-cors-gratis': 'true' }
            });

            if (response.status === 429) {
                if (retries > 0) {
                    // JITTER: Wait between 5-8 seconds to mimic a human browser
                    const jitter = Math.floor(Math.random() * 3000) + 5000;
                    console.warn(`Rate limit! Cooling down for ${jitter/1000}s...`);
                    await sleep(jitter);
                    return fetchWithStealth(scUrl, retries - 1);
                }
                throw new Error("SoundCloud is currently locked. Try again in 5 minutes.");
            }

            const data = await response.json();
            const result = isAllOrigins ? JSON.parse(data.contents) : data;
            
            if (!result || (!result.collection && !isAllOrigins)) throw new Error("Invalid Data Received");
            return result;

        } catch (err) {
            if (retries > 0) {
                await sleep(2000);
                return fetchWithStealth(scUrl, retries - 1);
            }
            throw err;
        }
    }

    // --- MAIN DISCOVERY LOGIC ---
    async function fetchDiscoveryData() {
        const seed = seedArtistInput.value.trim();
        if (!seed) return;

        loadingDiv.style.display = 'block';
        errorDiv.style.display = 'none';
        discoveredTracksGrid.innerHTML = '';
        console.log(`Starting stealth dig for: ${seed}`);

        try {
            // 1. Get Recommendations from Last.fm
            const lfmUrl = `https://ws.audioscrobbler.com/2.0/?method=artist.getSimilar&artist=${encodeURIComponent(seed)}&api_key=${LASTFM_KEY}&format=json&limit=5`;
            const lfmRes = await fetch(lfmUrl);
            const lfmData = await lfmRes.json();
            
            if (!lfmData.similarartists || !lfmData.similarartists.artist) {
                throw new Error("Artist not found. Try a different seed.");
            }

            const artists = lfmData.similarartists.artist;
            let foundTracks = [];

            // 2. Sequential Search with Jitter
            for (let artist of artists) {
                console.log(`Searching for: ${artist.name}`);
                
                // limit=2 to keep the request size small and inconspicuous
                const scSearchUrl = `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(artist.name + " Remix")}&client_id=${SC_CLIENT_ID}&limit=2`;
                
                try {
                    const scData = await fetchWithStealth(scSearchUrl);

                    if (scData && scData.collection) {
                        scData.collection.forEach(track => {
                            const plays = track.playback_count || 0;
                            // FILTER: Emerging 140-150 BPM Bass (< 50,000 plays)
                            if (plays < 50000 && plays > 100) {
                                foundTracks.push({
                                    artist: artist.name,
                                    title: track.title,
                                    plays: plays,
                                    url: track.permalink_url,
                                    genre: track.genre || "Bass",
                                    bpm: track.bpm || "???"
                                });
                            }
                        });
                    }

                    // Standard spacing (3.5s) to avoid triggering security
                    await sleep(3500);

                } catch (scErr) {
                    console.error(`Skipped ${artist.name}:`, scErr.message);
                }
            }

            const uniqueTracks = foundTracks.filter((v, i, a) => a.findIndex(t => t.url === v.url) === i);
            renderTracks(uniqueTracks, discoveredTracksGrid);

        } catch (err) {
            console.error("Discovery Error:", err);
            errorDiv.textContent = err.message || "Connection issues. Please try again later.";
            errorDiv.style.display = 'block';
        } finally {
            loadingDiv.style.display = 'none';
        }
    }

    // --- UI HELPERS ---
    function renderTracks(tracks, container, isPinned = false) {
        if (tracks.length === 0 && !isPinned) {
            container.innerHTML = "<p>No emerging tracks found. Try a more underground artist.</p>";
            return;
        }

        container.innerHTML = tracks.map(track => {
            const encoded = encodeURIComponent(JSON.stringify(track));
            return `
            <div class="track-card">
                <div class="genre-tag">${track.genre}</div>
                <h3>${track.title}</h3>
                <p>by ${track.artist}</p>
                <div class="details">
                    <span class="bpm">${track.bpm} BPM</span> | 
                    <span class="plays">${track.plays.toLocaleString()} Plays</span>
                </div>
                <div class="actions">
                    <a href="${track.url}" target="_blank">LISTEN</a>
                    <button class="pin-btn" onclick="handlePinClick('${encoded}', ${isPinned})">
                        ${isPinned ? 'REMOVE' : 'PIN'}
                    </button>
                </div>
            </div>`;
        }).join('');
    }

    // --- PINNING LOGIC ---
    window.handlePinClick = (encodedTrack, isPinned) => {
        const track = JSON.parse(decodeURIComponent(encodedTrack));
        if (isPinned) {
            pinnedTracks = pinnedTracks.filter(p => p.url !== track.url);
        } else {
            if (!pinnedTracks.some(p => p.url === track.url)) {
                pinnedTracks.push(track);
            }
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(pinnedTracks));
        renderTracks(pinnedTracks, pinnedTracksGrid, true);
    };

    // --- EVENT LISTENERS ---
    discoverBtn.addEventListener('click', fetchDiscoveryData);
    seedArtistInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') fetchDiscoveryData();
    });

    renderTracks(pinnedTracks, pinnedTracksGrid, true);
});
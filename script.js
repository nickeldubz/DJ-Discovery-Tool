document.addEventListener('DOMContentLoaded', () => {
    console.log("NAME DROP | Discovery Crate - Resilience Mode Active");

    // --- API CREDENTIALS ---
    const LASTFM_KEY = "533281fde87701480cd27a936bcaef0b";
    const SC_CLIENT_ID = "cES7wr3PiVoJHfpPvtmpDLnx9NjRzMha";
    const PROXY_BASE = "https://proxy.cors.sh/";

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

    // --- ROBUST FETCH WITH RETRY ---
    async function fetchWithRetry(url, options, retries = 3, backoff = 3000) {
        try {
            const response = await fetch(url, options);
            
            if (response.status === 429) {
                if (retries > 0) {
                    // Check if server told us how long to wait
                    const retryAfter = response.headers.get('Retry-After');
                    const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : backoff;
                    
                    console.warn(`Rate limited. Retrying in ${waitTime/1000}s...`);
                    await sleep(waitTime);
                    return fetchWithRetry(url, options, retries - 1, backoff * 2);
                } else {
                    throw new Error("Max retries exceeded for this artist.");
                }
            }
            
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();
        } catch (err) {
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
        console.log(`Starting resilient dig for: ${seed}`);

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

            // 2. Sequential SoundCloud Search with Backoff
            for (let artist of artists) {
                console.log(`Digging: ${artist.name}`);
                
                const scSearchUrl = `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(artist.name + " Remix")}&client_id=${SC_CLIENT_ID}&limit=3`;
                const proxiedUrl = `${PROXY_BASE}${scSearchUrl}`;
                
                try {
                    const scData = await fetchWithRetry(proxiedUrl, {
                        headers: { 'x-cors-gratis': 'true' }
                    });

                    if (scData.collection) {
                        scData.collection.forEach(track => {
                            const plays = track.playback_count || 0;
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

                    // Standard spacing between successful requests
                    await sleep(2500);

                } catch (scErr) {
                    console.error(`Skipped ${artist.name}:`, scErr.message);
                }
            }

            const uniqueTracks = foundTracks.filter((v, i, a) => a.findIndex(t => t.url === v.url) === i);
            renderTracks(uniqueTracks, discoveredTracksGrid);

        } catch (err) {
            console.error("Discovery Error:", err);
            errorDiv.textContent = "Rate limit reached. Wait a moment and try a different seed.";
            errorDiv.style.display = 'block';
        } finally {
            loadingDiv.style.display = 'none';
        }
    }

    // --- UI HELPERS & PINNING (Keep same as before) ---
    function renderTracks(tracks, container, isPinned = false) {
        if (tracks.length === 0 && !isPinned) {
            container.innerHTML = "<p>No emerging tracks found. Try an underground artist.</p>";
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

    window.handlePinClick = (encodedTrack, isPinned) => {
        const track = JSON.parse(decodeURIComponent(encodedTrack));
        if (isPinned) pinnedTracks = pinnedTracks.filter(p => p.url !== track.url);
        else if (!pinnedTracks.some(p => p.url === track.url)) pinnedTracks.push(track);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(pinnedTracks));
        renderTracks(pinnedTracks, pinnedTracksGrid, true);
    };

    discoverBtn.addEventListener('click', fetchDiscoveryData);
    seedArtistInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') fetchDiscoveryData();
    });

    renderTracks(pinnedTracks, pinnedTracksGrid, true);
});
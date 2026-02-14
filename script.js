document.addEventListener('DOMContentLoaded', () => {
    console.log("NAME DROP | Discovery Crate - Rate-Limited Mode Active");

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
    // Pauses execution to respect API rate limits
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // --- MAIN DISCOVERY LOGIC ---
    async function fetchDiscoveryData() {
        const seed = seedArtistInput.value.trim();
        if (!seed) return;

        // Reset UI
        loadingDiv.style.display = 'block';
        errorDiv.style.display = 'none';
        discoveredTracksGrid.innerHTML = '';
        console.log(`Starting ethical dig for: ${seed}`);

        try {
            // 1. Get Recommendations from Last.fm
            // Note: Last.fm is generally lenient, but we fetch it once per "DIG"
            const lfmUrl = `https://ws.audioscrobbler.com/2.0/?method=artist.getSimilar&artist=${encodeURIComponent(seed)}&api_key=${LASTFM_KEY}&format=json&limit=5`;
            const lfmRes = await fetch(lfmUrl);
            const lfmData = await lfmRes.json();
            
            if (!lfmData.similarartists || !lfmData.similarartists.artist) {
                throw new Error("Artist not found. Try a different seed.");
            }

            const artists = lfmData.similarartists.artist;
            let foundTracks = [];

            // 2. Sequential SoundCloud Search with Throttling
            // Processing one artist at a time to prevent 429 errors
            for (let artist of artists) {
                console.log(`Requesting data for ${artist.name}...`);
                
                const scSearchUrl = `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(artist.name + " Remix")}&client_id=${SC_CLIENT_ID}&limit=3`;
                const proxiedUrl = `${PROXY_BASE}${scSearchUrl}`;
                
                try {
                    const scRes = await fetch(proxiedUrl, {
                        headers: { 'x-cors-gratis': 'true' }
                    });

                    // Mitigation: If we hit a rate limit, wait 5 seconds and skip this artist
                    if (scRes.status === 429) {
                        console.warn("Rate limit detected. Backing off for 5 seconds...");
                        await sleep(5000);
                        continue;
                    }

                    if (!scRes.ok) throw new Error(`Proxy Error: ${scRes.status}`);

                    const scData = await scRes.json();

                    if (scData.collection) {
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

                    // RATE LIMITING MEASURE: Wait 2 seconds before the next artist search
                    // This mimics human "crate digging" speed
                    await sleep(2000);

                } catch (scErr) {
                    console.error(`Skipping ${artist.name} due to fetch error.`, scErr);
                }
            }

            // Remove duplicates and render
            const uniqueTracks = foundTracks.filter((v, i, a) => a.findIndex(t => t.url === v.url) === i);
            renderTracks(uniqueTracks, discoveredTracksGrid);

        } catch (err) {
            console.error("Discovery Error:", err);
            errorDiv.textContent = err.message || "Connection timed out. Please try again in a minute.";
            errorDiv.style.display = 'block';
        } finally {
            loadingDiv.style.display = 'none';
        }
    }

    // --- UI HELPERS ---
    function renderTracks(tracks, container, isPinned = false) {
        if (tracks.length === 0 && !isPinned) {
            container.innerHTML = "<p>No emerging tracks found for this seed. Try a more underground artist.</p>";
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

    // Initial render of saved crate
    renderTracks(pinnedTracks, pinnedTracksGrid, true);
});
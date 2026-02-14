document.addEventListener('DOMContentLoaded', () => {
    console.log("NAME DROP Discovery App Initialized.");

    // --- API CREDENTIALS ---
    const LASTFM_KEY = "533281fde87701480cd27a936bcaef0b";
    const SC_CLIENT_ID = "cES7wr3PiVoJHfpPvtmpDLnx9NjRzMha";
    const PROXY_URL = "https://api.allorigins.win/get?url=";

    // --- UI ELEMENTS ---
    const seedArtistInput = document.getElementById('seedArtistInput');
    const discoverBtn = document.getElementById('discoverBtn');
    const discoveredTracksGrid = document.getElementById('discoveredTracksGrid');
    const pinnedTracksGrid = document.getElementById('pinnedTracksGrid');
    const loadingDiv = document.getElementById('loading');
    const errorDiv = document.getElementById('error');

    const STORAGE_KEY = 'namedrop_pinned_crate';
    let pinnedTracks = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];

    // --- MAIN DISCOVERY LOGIC ---
async function fetchDiscoveryData() {
    const seed = seedArtistInput.value.trim();
    if (!seed) return;

    loadingDiv.style.display = 'block';
    errorDiv.style.display = 'none';
    discoveredTracksGrid.innerHTML = '';

    try {
        // 1. Last.fm (Recommendations) - No proxy needed usually
        const lfmUrl = `https://ws.audioscrobbler.com/2.0/?method=artist.getSimilar&artist=${encodeURIComponent(seed)}&api_key=${LASTFM_KEY}&format=json&limit=5`;
        const lfmRes = await fetch(lfmUrl);
        const lfmData = await lfmRes.json();
        
        const artists = lfmData.similarartists.artist;
        let foundTracks = [];

        // 2. SoundCloud Search (Using proxy.cors.sh)
        for (let artist of artists) {
            const scSearchUrl = `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(artist.name + " Remix")}&client_id=${SC_CLIENT_ID}&limit=3`;
            
            // We use the CORS.SH proxy which is built for API developers
            const proxiedUrl = `https://proxy.cors.sh/${scSearchUrl}`;
            
            try {
                const scRes = await fetch(proxiedUrl, {
                    headers: {
                        'x-cors-gratis': 'true' // This tells the proxy you are using the free tier
                    }
                });
                
                if (!scRes.ok) throw new Error("SoundCloud Proxy Error");
                const scData = await scRes.json();

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
            } catch (scErr) {
                console.warn(`Search failed for ${artist.name}. Service might be busy.`);
            }
        }
        renderTracks(foundTracks, discoveredTracksGrid);

    } catch (err) {
        console.error("Discovery Error:", err);
        errorDiv.textContent = "The connection is being blocked. Try again in a few minutes.";
        errorDiv.style.display = 'block';
    } finally {
        loadingDiv.style.display = 'none';
    }
}

    // --- UI HELPERS ---
    function renderTracks(tracks, container, isPinned = false) {
        console.log(`Rendering ${tracks.length} tracks to ${container.id}`);
        
        if (tracks.length === 0 && !isPinned) {
            container.innerHTML = "<p>No emerging tracks found. Try a more underground seed artist (e.g. RemK or FrostTop).</p>";
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
                        ${isPinned ? 'REMOVE' : 'PIN TO CRATE'}
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
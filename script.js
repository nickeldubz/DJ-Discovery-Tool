document.addEventListener('DOMContentLoaded', () => {
    // UI Elements
    const seedArtistInput = document.getElementById('seedArtistInput');
    const discoverBtn = document.getElementById('discoverBtn');
    const discoveredTracksGrid = document.getElementById('discoveredTracksGrid');
    const pinnedTracksGrid = document.getElementById('pinnedTracksGrid');
    const loadingDiv = document.getElementById('loading');
    const errorDiv = document.getElementById('error');

    // API Keys
    const LASTFM_KEY = "533281fde87701480cd27a936bcaef0b";
    const SC_CLIENT_ID = "cES7wr3PiVoJHfpPvtmpDLnx9NjRzMha";
    
    // We use corsproxy.io to bypass the 403 Forbidden on GitHub Pages
    const PROXY = "https://corsproxy.io/?";

    const STORAGE_KEY = 'namedrop_pinned_crate';
    let pinnedTracks = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];

    // --- MAIN SEARCH FUNCTION ---
    async function fetchDiscoveryData() {
        const seed = seedArtistInput.value.trim();
        if (!seed) return;

        loadingDiv.style.display = 'block';
        errorDiv.style.display = 'none';
        discoveredTracksGrid.innerHTML = '';

        try {
            // 1. Get Recommendations (Last.fm)
            const lfmUrl = `https://ws.audioscrobbler.com/2.0/?method=artist.getSimilar&artist=${encodeURIComponent(seed)}&api_key=${LASTFM_KEY}&format=json&limit=5`;
            const lfmRes = await fetch(`${PROXY}${encodeURIComponent(lfmUrl)}`);
            const lfmData = await lfmRes.json();
            
            const artists = lfmData.similarartists.artist;
            let foundTracks = [];

            // 2. Search SoundCloud for each Artist
            for (let artist of artists) {
                const scSearchUrl = `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(artist.name)}&client_id=${SC_CLIENT_ID}&limit=3`;
                
                // Fetch through proxy to get Play Counts
                const scRes = await fetch(`${PROXY}${encodeURIComponent(scSearchUrl)}`);
                const scData = await scRes.json();

                if (scData.collection) {
                    scData.collection.forEach(track => {
                        // FILTER: Emerging tracks for your 140-150 BPM sets
                        if (track.playback_count < 25000) {
                            foundTracks.push({
                                artist: artist.name,
                                title: track.title,
                                plays: track.playback_count || 0,
                                url: track.permalink_url,
                                genre: track.genre || "Bass",
                                bpm: track.bpm || "???"
                            });
                        }
                    });
                }
            }
            renderTracks(foundTracks, discoveredTracksGrid);

        } catch (err) {
            console.error("Discovery Error:", err);
            errorDiv.textContent = "Error: SoundCloud blocked the proxy. Try again in 1 minute.";
            errorDiv.style.display = 'block';
        } finally {
            loadingDiv.style.display = 'none';
        }
    }

    // --- UI HELPERS ---
    function renderTracks(tracks, container, isPinned = false) {
        if (tracks.length === 0 && !isPinned) {
            container.innerHTML = "<p>No emerging tracks found.</p>";
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
    renderTracks(pinnedTracks, pinnedTracksGrid, true);
});
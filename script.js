document.addEventListener('DOMContentLoaded', () => {
    console.log("NAME DROP | Last.fm Discovery Engine Active");

    const LASTFM_KEY = "533281fde87701480cd27a936bcaef0b";
    
    // UI Elements
    const seedArtistInput = document.getElementById('seedArtistInput');
    const discoverBtn = document.getElementById('discoverBtn');
    const discoveredTracksGrid = document.getElementById('discoveredTracksGrid');
    const pinnedTracksGrid = document.getElementById('pinnedTracksGrid');
    const loadingDiv = document.getElementById('loading');
    const errorDiv = document.getElementById('error');

    const STORAGE_KEY = 'namedrop_pinned_crate';
    let pinnedTracks = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];

    async function fetchDiscoveryData() {
        const query = seedArtistInput.value.trim();
        if (!query) return;

        loadingDiv.style.display = 'block';
        errorDiv.style.display = 'none';
        discoveredTracksGrid.innerHTML = '';

        try {
            // STEP 1: Get the Top Tags for your search (e.g., Trap, Bass, UKG)
            // We search for tracks and pull their tags to understand the "lane"
            const searchUrl = `https://ws.audioscrobbler.com/2.0/?method=artist.gettoptags&artist=${encodeURIComponent(query)}&api_key=${LASTFM_KEY}&format=json`;
            const searchRes = await fetch(searchUrl);
            const searchData = await searchRes.json();
            
            // Default tags if the artist search fails
            let targetTags = ['trap', 'bass', 'electronic']; 
            if (searchData.toptags && searchData.toptags.tag) {
                targetTags = searchData.toptags.tag.slice(0, 3).map(t => t.name.toLowerCase());
            }

            console.log("Digging in tags:", targetTags);

            let allFound = [];

            // STEP 2: Pull Top Tracks for those tags
            for (let tag of targetTags) {
                const tagUrl = `https://ws.audioscrobbler.com/2.0/?method=tag.gettoptracks&tag=${tag}&api_key=${LASTFM_KEY}&format=json&limit=20`;
                const tagRes = await fetch(tagUrl);
                const tagData = await tagRes.json();

                if (tagData.tracks && tagData.tracks.track) {
                    tagData.tracks.track.forEach(track => {
                        // FILTER: Only keep tracks with < 100k listeners (Emerging talent)
                        // Note: Last.fm counts are different than SC plays. 100k is "Underground" here.
                        const listeners = parseInt(track.listeners);
                        if (listeners < 100000) {
                            allFound.push({
                                artist: track.artist.name,
                                title: track.name,
                                plays: listeners, // Using Listeners as the "Play Count" proxy
                                url: track.url,
                                genre: tag.toUpperCase(),
                                bpm: "140-150" // Tag-based assumption for your sets
                            });
                        }
                    });
                }
            }

            // Remove duplicates and Sort by most "Underground" (lowest listeners)
            const unique = allFound
                .filter((v, i, a) => a.findIndex(t => (t.artist === v.artist && t.title === v.title)) === i)
                .sort((a, b) => a.plays - b.plays);

            renderTracks(unique.slice(0, 15), discoveredTracksGrid);

        } catch (err) {
            console.error("Discovery Error:", err);
            errorDiv.textContent = "Last.fm is currently unavailable. Try again in a moment.";
            errorDiv.style.display = 'block';
        } finally {
            loadingDiv.style.display = 'none';
        }
    }

    // --- UI HELPERS ---
    function renderTracks(tracks, container, isPinned = false) {
        if (tracks.length === 0 && !isPinned) {
            container.innerHTML = "<p>No emerging tracks found in these tags.</p>";
            return;
        }

        container.innerHTML = tracks.map(track => {
            const encoded = encodeURIComponent(JSON.stringify(track));
            // We use a SoundCloud search link as the "LISTEN" action
            const scSearchLink = `https://soundcloud.com/search?q=${encodeURIComponent(track.artist + " " + track.title)}`;
            
            return `
            <div class="track-card">
                <div class="genre-tag">${track.genre}</div>
                <h3>${track.title}</h3>
                <p>by ${track.artist}</p>
                <div class="details">
                    <span class="plays">${track.plays.toLocaleString()} Listeners</span>
                </div>
                <div class="actions">
                    <a href="${scSearchLink}" target="_blank">SEARCH SC</a>
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
document.addEventListener('DOMContentLoaded', () => {
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

    // YOUR CORE GENRES (The "Safety Net")
    const CORE_GENRES = ['hybrid trap', 'bass music', 'uk garage', 'wave'];

    async function fetchDiscoveryData() {
        const query = seedArtistInput.value.trim();
        if (!query) return;

        loadingDiv.style.display = 'block';
        errorDiv.style.display = 'none';
        discoveredTracksGrid.innerHTML = '';

        try {
            // 1. Get Artist Tags
            const tagUrl = `https://ws.audioscrobbler.com/2.0/?method=artist.gettoptags&artist=${encodeURIComponent(query)}&api_key=${LASTFM_KEY}&format=json`;
            const tagRes = await fetch(tagUrl);
            const tagData = await tagRes.json();
            
            let searchTags = [];
            const junk = ['canadian', 'american', 'seen live', 'favorites', 'male vocalists'];

            if (tagData.toptags && tagData.toptags.tag) {
                searchTags = tagData.toptags.tag
                    .map(t => t.name.toLowerCase())
                    .filter(name => !junk.includes(name))
                    .slice(0, 3);
            }

            // WATERFALL: If no tags found, or search is too broad, add your core genres
            const finalTags = [...new Set([...searchTags, ...CORE_GENRES])].slice(0, 5);
            console.log("Searching in waterfall tags:", finalTags);

            let allTracks = [];

            for (let tag of finalTags) {
                const url = `https://ws.audioscrobbler.com/2.0/?method=tag.gettoptracks&tag=${encodeURIComponent(tag)}&api_key=${LASTFM_KEY}&format=json&limit=30`;
                const res = await fetch(url);
                const data = await res.json();

                if (data.tracks && data.tracks.track) {
                    data.tracks.track.forEach(track => {
                        const listeners = parseInt(track.listeners);
                        // We filter for "Underground" (Low listener count)
                        if (listeners < 200000 && listeners > 100) {
                            allTracks.push({
                                artist: track.artist.name,
                                title: track.name,
                                plays: listeners,
                                url: track.url,
                                genre: tag.toUpperCase()
                            });
                        }
                    });
                }
            }

            // De-duplicate and shuffle for variety
            const unique = allTracks
                .filter((v, i, a) => a.findIndex(t => (t.artist === v.artist && t.title === v.title)) === i)
                .sort(() => 0.5 - Math.random()); // Randomize so it's not the same list every time

            renderTracks(unique.slice(0, 20), discoveredTracksGrid);

        } catch (err) {
            console.error(err);
            errorDiv.textContent = "Error fetching data. Check your connection.";
            errorDiv.style.display = 'block';
        } finally {
            loadingDiv.style.display = 'none';
        }
    }

    // --- UI HELPERS ---
    function renderTracks(tracks, container, isPinned = false) {
        if (tracks.length === 0 && !isPinned) {
            container.innerHTML = "<p>Nothing found. Try searching for 'Trap' or 'Bass'.</p>";
            return;
        }

        container.innerHTML = tracks.map(track => {
            const encoded = encodeURIComponent(JSON.stringify(track));
            const scLink = `https://soundcloud.com/search?q=${encodeURIComponent(track.artist + " " + track.title)}`;
            
            return `
            <div class="track-card">
                <div class="genre-tag">${track.genre}</div>
                <h3>${track.title}</h3>
                <p>by ${track.artist}</p>
                <div class="details">
                    <span class="plays">${track.plays.toLocaleString()} Listeners</span>
                </div>
                <div class="actions">
                    <a href="${scLink}" target="_blank">LISTEN</a>
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
    seedArtistInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') fetchDiscoveryData(); });
    renderTracks(pinnedTracks, pinnedTracksGrid, true);
});